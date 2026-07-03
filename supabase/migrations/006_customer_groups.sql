-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

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
