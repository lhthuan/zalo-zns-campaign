-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

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
