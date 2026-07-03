-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- 1) Zalo's template/info/v2 response turns out to include a preview link and
--    real per-send-mode pricing — no need for the admin-entered estimate
--    table anymore.
alter table public.zalo_templates add column if not exists preview_url text;
alter table public.zalo_templates add column if not exists price_sdt numeric(12, 2);
alter table public.zalo_templates add column if not exists price_uid numeric(12, 2);
drop table if exists public.zns_pricing;

-- 2) Per-API-key risk limits: a NULL limit means unlimited. total_sends is a
--    running counter (incremented on every attempt, success or failure, same
--    as how last_used_at already updates regardless of outcome); the daily
--    count is derived from api_send_log at request time instead of a second
--    counter, since "today" resets on its own.
alter table public.api_keys add column if not exists max_total_sends int;
alter table public.api_keys add column if not exists max_daily_sends int;
alter table public.api_keys add column if not exists total_sends int not null default 0;
