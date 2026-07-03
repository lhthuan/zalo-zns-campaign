-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- API keys for external systems (their own order system, POS, CRM...) to call
-- POST /api/sendzns directly, without going through the dashboard. Only the
-- salted hash is stored — the plaintext key is shown to the admin exactly
-- once, at creation time.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  key_prefix text not null, -- first chars of the plaintext, shown in the UI so admins can recognize which key is which
  is_active boolean not null default true,
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
  template_id text not null, -- Zalo's own template_id string, not our internal uuid
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
