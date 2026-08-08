-- Run this once in the Supabase SQL Editor if vice_tracking.sql was already run.
-- Existing timestamps are converted to their New York local calendar date and time.

alter table public.weed_hits
  add column if not exists occurred_on date,
  add column if not exists occurred_at time without time zone;

update public.weed_hits
set
  occurred_on = (created_at at time zone 'America/New_York')::date,
  occurred_at = (created_at at time zone 'America/New_York')::time(0)
where occurred_on is null or occurred_at is null;

alter table public.weed_hits
  alter column occurred_on set default ((now() at time zone 'America/New_York')::date),
  alter column occurred_on set not null,
  alter column occurred_at set default ((now() at time zone 'America/New_York')::time(0)),
  alter column occurred_at set not null;

create index if not exists weed_hits_user_occurred_on_idx
  on public.weed_hits (user_id, occurred_on desc);

alter table public.alcohol_entries
  add column if not exists occurred_on date,
  add column if not exists occurred_at time without time zone;

update public.alcohol_entries
set
  occurred_on = (created_at at time zone 'America/New_York')::date,
  occurred_at = (created_at at time zone 'America/New_York')::time(0)
where occurred_on is null or occurred_at is null;

alter table public.alcohol_entries
  alter column occurred_on set default ((now() at time zone 'America/New_York')::date),
  alter column occurred_on set not null,
  alter column occurred_at set default ((now() at time zone 'America/New_York')::time(0)),
  alter column occurred_at set not null;

create index if not exists alcohol_entries_user_occurred_on_idx
  on public.alcohol_entries (user_id, occurred_on desc);
