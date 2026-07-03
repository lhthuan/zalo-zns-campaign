-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

alter table public.customers add column if not exists import_batch text;
create index if not exists idx_customers_import_batch on public.customers (import_batch) where import_batch is not null;

-- Deleting an import batch (or any customer) should not be blocked by, or
-- destroy, historical campaign_recipients rows — just detach them.
alter table public.campaign_recipients drop constraint if exists campaign_recipients_customer_id_fkey;
alter table public.campaign_recipients
  add constraint campaign_recipients_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

create or replace function public.customer_import_batches()
returns table (import_batch text, customer_count bigint, last_imported_at timestamptz)
language sql stable as $$
  select import_batch, count(*)::bigint, max(updated_at)
  from public.customers
  where import_batch is not null
  group by import_batch
  order by max(updated_at) desc;
$$;
