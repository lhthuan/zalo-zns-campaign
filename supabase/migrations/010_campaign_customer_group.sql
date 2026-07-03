-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- Broadcast campaigns could only target "all customers" or one import batch
-- (customer_batch). Adding an alternative: target one customer_groups segment
-- instead. Mutually exclusive with customer_batch at the application level
-- (only one of the two is set per campaign).
alter table public.campaigns
  add column if not exists customer_group_id uuid references public.customer_groups(id) on delete set null;
