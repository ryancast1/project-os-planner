-- Run once in the Supabase SQL Editor to enable timezone-aware Vices logging.
-- Existing rows keep NULL, retaining their historical New York interpretation.
begin;

alter table public.weed_hits
  add column if not exists time_zone text;

alter table public.alcohol_entries
  add column if not exists time_zone text;

commit;
