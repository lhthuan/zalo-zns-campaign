-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- customers.import_batch is a single text column that gets overwritten every
-- time the same customer (matched by phone/zalo_uid) shows up in a later
-- import or custom campaign upload — so it only ever reflects the MOST
-- RECENT batch that touched a contact, not the full history. This table is
-- an append-only log: every upsert touch during import/campaign creation
-- inserts one row here, so "which batches has this contact ever come from"
-- can be answered by querying history instead of trusting the single
-- customers.import_batch value.
create table public.customer_import_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  import_batch text not null,
  imported_at timestamptz not null default now()
);
create index idx_customer_import_history_customer on public.customer_import_history (customer_id, imported_at desc);
create index idx_customer_import_history_batch on public.customer_import_history (import_batch);
alter table public.customer_import_history enable row level security;
