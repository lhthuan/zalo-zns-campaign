-- Run this once in the SQL Editor for an existing project that already has schema.sql applied.
-- (New projects get this automatically since it's now part of schema.sql.)

create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  zalo_app_id text,
  zalo_app_secret_key text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- no policies: only service_role (bypasses RLS) can access, same as zalo_oauth_tokens.
