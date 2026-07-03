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
  name text, -- nullable: 1 dòng import không map cột tên sẽ không ghi đè tên đã biết của KH cũ (xem
             -- presentCustomerFields ở lib/spreadsheet/import.ts) — UI fallback về SĐT/UID lúc hiển thị
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

-- A customer can belong to many groups, and a group can have many customers
-- (many-to-many) — distinct from import_batch (one label per customer, set
-- automatically at import time). Groups are admin-managed segments used to
-- filter the customer table and, from a filtered/selected view, to spin off
-- a new group in one click.
create table public.customer_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_groups enable row level security;

create table public.customer_group_members (
  group_id uuid not null references public.customer_groups(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, customer_id)
);
create index idx_customer_group_members_customer on public.customer_group_members (customer_id);
alter table public.customer_group_members enable row level security;

create or replace function public.customer_group_counts()
returns table (group_id uuid, name text, customer_count bigint)
language sql stable as $$
  select g.id, g.name, count(m.customer_id)::bigint
  from public.customer_groups g
  left join public.customer_group_members m on m.group_id = g.id
  group by g.id, g.name
  order by g.name;
$$;

create table public.zalo_templates (
  id uuid primary key default gen_random_uuid(),
  template_id text not null unique,
  template_name text not null,
  -- giá trị thật trả về từ Zalo: ENABLE / PENDING_REVIEW / REJECT / DISABLE (KHÔNG có "APPROVED")
  status text not null check (status in ('ENABLE','PENDING_REVIEW','REJECT','DISABLE')),
  tag text, -- TRANSACTION / CUSTOMER_CARE / PROMOTION, ảnh hưởng điều kiện gửi qua UID
  template_data_schema jsonb, -- lấy từ field listParams của template/info/v2
  preview_url text, -- link xem trước template, từ field previewUrl của template/info/v2
  price_sdt numeric(12,2), -- đơn giá gửi qua SĐT, từ field price_sdt
  price_uid numeric(12,2), -- đơn giá gửi qua UID, từ field price_uid
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
  customer_batch text, -- chỉ set khi creation_mode='broadcast' + chọn theo lô: lô KH đã chọn lúc tạo
  customer_group_id uuid references public.customer_groups(id) on delete set null, -- hoặc chọn theo nhóm KH (loại trừ lẫn nhau với customer_batch)
  fixed_template_data jsonb, -- chỉ set khi creation_mode='broadcast': tham số cố định đã điền lúc tạo
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_campaigns_status on public.campaigns (status);
create index idx_campaigns_is_hidden on public.campaigns (is_hidden);

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

-- API keys for external systems (their own order system, POS, CRM...) to call
-- POST /api/sendzns directly, without going through the dashboard. Only the
-- salted hash is stored — the plaintext key is shown to the admin exactly
-- once, at creation time.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  is_active boolean not null default true,
  max_total_sends int, -- null = không giới hạn
  max_daily_sends int, -- null = không giới hạn; ngày tính theo api_send_log, không cần counter riêng
  total_sends int not null default 0, -- tăng mỗi lần thử gửi (kể cả thất bại), giống last_used_at
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.api_keys enable row level security;

create table public.api_send_log (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.api_keys(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null,
  zalo_uid text,
  template_id text not null,
  template_data jsonb not null,
  send_mode text not null check (send_mode in ('uid','phone')),
  success boolean not null,
  zalo_msg_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);
create index idx_api_send_log_phone on public.api_send_log (phone);
create index idx_api_send_log_created on public.api_send_log (created_at desc);
alter table public.api_send_log enable row level security;

-- "Gửi thử" (send-test) sends were never persisted anywhere — only returned
-- transiently in the API response. Logging them here lets the per-customer
-- "Tra cứu tin" message history include every source (campaign, send-test,
-- external API), not just campaigns + API.
create table public.test_send_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  sent_by uuid references public.profiles(id) on delete set null,
  phone text,
  zalo_uid text,
  template_id text not null,
  template_data jsonb not null,
  send_mode text not null check (send_mode in ('uid','phone')),
  success boolean not null,
  zalo_msg_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);
create index idx_test_send_log_customer on public.test_send_log (customer_id);
alter table public.test_send_log enable row level security;

-- Executive overview dashboard: one round trip instead of N+1 queries from
-- the app. Aggregates across all 3 send sources (campaign, gửi thử, API
-- ngoài) since Zalo charges for all 3 the same way. Cost is computed from
-- zalo_templates.price_sdt/price_uid, matched by the Zalo template_id text
-- (campaign_recipients only has the internal uuid via campaigns.template_id;
-- api_send_log/test_send_log already store the Zalo template_id text).
create or replace function public.dashboard_overview(days_back int default null)
returns jsonb
language plpgsql
stable
as $$
declare
  cutoff timestamptz := case when days_back is null then '-infinity'::timestamptz
                              else now() - (days_back || ' days')::interval end;
  result jsonb;
begin
  with camp_recipients as (
    select
      cr.campaign_id,
      cr.customer_id,
      cr.status,
      cr.send_mode,
      case
        when cr.status = 'sent' and cr.send_mode = 'phone' then coalesce(zt.price_sdt, 0)
        when cr.status = 'sent' and cr.send_mode = 'uid' then coalesce(zt.price_uid, 0)
        else 0
      end as cost
    from public.campaign_recipients cr
    join public.campaigns c on c.id = cr.campaign_id
    join public.zalo_templates zt on zt.id = c.template_id
    where coalesce(cr.sent_at, cr.created_at) >= cutoff
  ),
  by_campaign as (
    select
      c.id,
      c.name,
      c.status,
      count(*) filter (where cr.status = 'sent') as sent,
      count(*) filter (where cr.status = 'failed') as failed,
      count(*) filter (where cr.status = 'pending') as pending,
      coalesce(sum(cr.cost), 0) as cost
    from public.campaigns c
    left join camp_recipients cr on cr.campaign_id = c.id
    group by c.id, c.name, c.status
  ),
  by_channel as (
    select
      send_mode,
      count(*) filter (where status = 'sent') as sent,
      coalesce(sum(cost), 0) as cost
    from camp_recipients
    group by send_mode
  ),
  api_rows as (
    select
      asl.success,
      case when asl.success then
        case when asl.send_mode = 'phone' then coalesce(zt.price_sdt, 0) else coalesce(zt.price_uid, 0) end
      else 0 end as cost
    from public.api_send_log asl
    left join public.zalo_templates zt on zt.template_id = asl.template_id
    where asl.created_at >= cutoff
  ),
  test_rows as (
    select
      tsl.success,
      case when tsl.success then
        case when tsl.send_mode = 'phone' then coalesce(zt.price_sdt, 0) else coalesce(zt.price_uid, 0) end
      else 0 end as cost
    from public.test_send_log tsl
    left join public.zalo_templates zt on zt.template_id = tsl.template_id
    where tsl.created_at >= cutoff
  ),
  top_customers as (
    select
      cust.id,
      cust.name,
      cust.phone,
      count(*) as message_count
    from public.campaign_recipients cr
    join public.customers cust on cust.id = cr.customer_id
    where cr.status = 'sent' and coalesce(cr.sent_at, cr.created_at) >= cutoff
    group by cust.id, cust.name, cust.phone
    order by count(*) desc
    limit 10
  )
  select jsonb_build_object(
    'byCampaign',
      (select coalesce(jsonb_agg(row_to_json(bc.*) order by (bc.sent + bc.failed) desc), '[]'::jsonb)
       from by_campaign bc),
    'byChannel',
      (select coalesce(jsonb_agg(row_to_json(ch.*)), '[]'::jsonb) from by_channel ch),
    'topCustomers',
      (select coalesce(jsonb_agg(row_to_json(tc.*)), '[]'::jsonb) from top_customers tc),
    'totals', jsonb_build_object(
      'campaignCount', (select count(*) from public.campaigns),
      'campaignSent', (select coalesce(sum(sent), 0) from by_campaign),
      'campaignFailed', (select coalesce(sum(failed), 0) from by_campaign),
      'campaignPending', (select coalesce(sum(pending), 0) from by_campaign),
      'campaignCost', (select coalesce(sum(cost), 0) from by_campaign),
      'apiSent', (select count(*) from api_rows where success),
      'apiFailed', (select count(*) from api_rows where not success),
      'apiCost', (select coalesce(sum(cost), 0) from api_rows),
      'testSent', (select count(*) from test_rows where success),
      'testFailed', (select count(*) from test_rows where not success),
      'testCost', (select coalesce(sum(cost), 0) from test_rows)
    )
  ) into result;

  return result;
end;
$$;

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
