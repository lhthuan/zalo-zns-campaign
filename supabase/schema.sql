create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role) values (new.id, new.email, 'staff');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  name text not null,
  phone text unique, -- unique để import xlsx có thể upsert theo phone (ON CONFLICT); nullable vì
                      -- khách có thể chỉ có Zalo UID (không có SĐT) — xem check constraint dưới
  zalo_uid text,
  import_batch text, -- tên lô import (từ trang import hoặc tên chiến dịch tuỳ biến) để lọc/xoá theo lô
  extra_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_phone_or_uid_check check (phone is not null or zalo_uid is not null)
);
-- phone đã có unique index tự động từ constraint `unique` ở trên (NULL không đụng NULL khác)
-- zalo_uid cần UNIQUE (không chỉ index thường) để import/chiến dịch có thể upsert theo UID
-- khi khách không có SĐT.
create unique index idx_customers_zalo_uid_unique on public.customers (zalo_uid) where zalo_uid is not null;
create index idx_customers_import_batch on public.customers (import_batch) where import_batch is not null;

create or replace function public.customer_import_batches()
returns table (import_batch text, customer_count bigint, last_imported_at timestamptz)
language sql stable as $$
  select import_batch, count(*)::bigint, max(updated_at)
  from public.customers
  where import_batch is not null
  group by import_batch
  order by max(updated_at) desc;
$$;

create table public.zalo_templates (
  id uuid primary key default gen_random_uuid(),
  template_id text not null unique,
  template_name text not null,
  -- giá trị thật trả về từ Zalo: ENABLE / PENDING_REVIEW / REJECT / DISABLE (KHÔNG có "APPROVED")
  status text not null check (status in ('ENABLE','PENDING_REVIEW','REJECT','DISABLE')),
  tag text, -- TRANSACTION / CUSTOMER_CARE / PROMOTION, ảnh hưởng điều kiện gửi qua UID
  template_data_schema jsonb, -- lấy từ field listParams của template/info/v2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

-- token OAuth đổi mỗi lần refresh -> lưu DB, không lưu env
-- locked_until: lock đơn giản qua conditional UPDATE (claim khi NULL hoặc đã hết hạn),
-- tránh 2 batch cùng refresh_token 1 lúc (refresh_token Zalo chỉ dùng được 1 lần).
create table public.zalo_oauth_tokens (
  id smallint primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- App ID/Secret Zalo lưu DB (không phải env var) để sửa qua trang /settings mà
-- không cần redeploy. Chỉ service_role đọc/ghi được (xem RLS phía dưới).
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  zalo_app_id text,
  zalo_app_secret_key text,
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid not null references public.zalo_templates(id),
  status text not null default 'draft'
    check (status in ('draft','sending','completed','completed_with_errors','failed')),
  total_recipients int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  source_file_name text,
  is_hidden boolean not null default false, -- ẩn khỏi danh sách mặc định, không xoá dữ liệu
  creation_mode text check (creation_mode in ('broadcast','custom')), -- để "Sao chép" prefill lại đúng chế độ
  customer_batch text, -- chỉ set khi creation_mode='broadcast': lô KH đã chọn lúc tạo (null = tất cả)
  fixed_template_data jsonb, -- chỉ set khi creation_mode='broadcast': tham số cố định đã điền lúc tạo
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_campaigns_status on public.campaigns (status);
create index idx_campaigns_is_hidden on public.campaigns (is_hidden);

-- Giá ước tính mỗi tin theo loại template (tag) — Zalo không trả giá theo hợp
-- đồng qua API, nên đây là số admin tự nhập theo hợp đồng thật của OA.
create table public.zns_pricing (
  tag text primary key check (tag in ('TRANSACTION','CUSTOMER_CARE','PROMOTION','OTHER')),
  price_vnd numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.zns_pricing enable row level security;

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone text, -- null khi snapshot từ khách hàng chỉ có Zalo UID (không có SĐT)
  zalo_uid text,
  template_data jsonb not null,
  send_mode text not null check (send_mode in ('uid','phone')),
  tracking_id text not null, -- bắt buộc theo API gửi tin qua SĐT; cũng sinh cho nhánh UID để đối soát nội bộ
  batch_number int not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  zalo_msg_id text,
  error_code text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_recipients_campaign on public.campaign_recipients (campaign_id);
create index idx_recipients_campaign_batch on public.campaign_recipients (campaign_id, batch_number);
create index idx_recipients_campaign_status on public.campaign_recipients (campaign_id, status);

-- RLS: khoá hết, app chỉ truy cập qua API route dùng service_role
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.zalo_templates enable row level security;
alter table public.zalo_oauth_tokens enable row level security;
alter table public.app_settings enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);
-- không policy nào khác: anon/authenticated mặc định = 0 quyền;
-- service_role bỏ qua RLS, chỉ dùng ở server, không bao giờ lộ ra browser.
