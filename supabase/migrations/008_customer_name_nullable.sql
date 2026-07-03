-- Run this once in the SQL Editor for an existing project.
-- (New projects get this automatically since it's now part of schema.sql.)

-- Previously every customer got a fallback name (their phone number, or a
-- placeholder like "Dòng 5") just to satisfy NOT NULL. That's a real data
-- smell, and it blocked a re-import from safely "not touching" the name
-- column when a file doesn't map a name (Postgres validates NOT NULL on the
-- proposed row even when ON CONFLICT redirects it to an UPDATE). Making name
-- nullable lets writes only ever include the columns they actually have data
-- for; the UI falls back to phone/UID/"—" at display time instead.
alter table public.customers alter column name drop not null;
