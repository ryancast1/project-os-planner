-- Allow dashboard edits to the date, Eastern time, and trich type while
-- preserving per-user ownership.

alter table public.trich_events enable row level security;

drop policy if exists "Users can update their own trich events"
  on public.trich_events;

create policy "Users can update their own trich events"
  on public.trich_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update on table public.trich_events to authenticated;
