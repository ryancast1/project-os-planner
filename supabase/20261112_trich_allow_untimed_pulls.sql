-- Keep the timestamp default for live logging; offline entries explicitly use NULL.
alter table public.trich_events
  alter column submitted_at drop not null;
