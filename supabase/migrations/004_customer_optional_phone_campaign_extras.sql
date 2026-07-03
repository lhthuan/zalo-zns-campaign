-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- 1) Customers: allow saving with only name + Zalo UID (no phone). A customer
--    must still have at least one of phone/zalo_uid to be reachable.
alter table public.customers alter column phone drop not null;
alter table public.customers
  add constraint customers_phone_or_uid_check check (phone is not null or zalo_uid is not null);

-- zalo_uid needs a UNIQUE index (not just a plain index) so imports/campaigns
-- can upsert customers by UID when they have no phone number.
-- NOTE: this will fail if you already have duplicate zalo_uid values across
-- different customer rows — resolve those manually first if it errors.
drop index if exists idx_customers_zalo_uid;
create unique index idx_customers_zalo_uid_unique on public.customers (zalo_uid) where zalo_uid is not null;

-- A recipient snapshotted from a phone-less, UID-only customer has no phone to store.
alter table public.campaign_recipients alter column phone drop not null;

-- 2) Campaigns: hide/show + enough metadata to "duplicate" a campaign into a
--    prefilled draft (broadcast campaigns can be fully replayed; custom/file
--    campaigns can only prefill name+template since recipient-specific data
--    isn't naturally replayable without re-uploading a file).
alter table public.campaigns add column if not exists is_hidden boolean not null default false;
alter table public.campaigns add column if not exists creation_mode text check (creation_mode in ('broadcast','custom'));
alter table public.campaigns add column if not exists customer_batch text;
alter table public.campaigns add column if not exists fixed_template_data jsonb;
create index if not exists idx_campaigns_is_hidden on public.campaigns (is_hidden);

-- 3) ZNS pricing per template tag — Zalo's template API does not return a
--    contracted price, so this is admin-entered (from your real Zalo/reseller
--    contract) rather than fetched, and used only to show an estimated cost.
create table if not exists public.zns_pricing (
  tag text primary key check (tag in ('TRANSACTION', 'CUSTOMER_CARE', 'PROMOTION', 'OTHER')),
  price_vnd numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.zns_pricing enable row level security;
-- no policies: service_role only, same as the other settings-style tables.
