-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- customers.import_batch gets overwritten every time that customer is
-- touched by a later import/campaign, so it can't tell you which batch a
-- customer's data came from *at the time a given campaign was sent*.
-- Snapshotting the batch label onto each campaign_recipients row at creation
-- time keeps that history intact even after customers.import_batch changes.
alter table public.campaign_recipients add column if not exists import_batch text;
create index if not exists idx_recipients_import_batch on public.campaign_recipients (import_batch)
  where import_batch is not null;
