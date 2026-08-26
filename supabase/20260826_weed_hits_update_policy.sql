-- weed_hits originally had select, insert, and delete policies but no update
-- policy. The database editor exposes occurred_on and occurred_at for editing.

alter table public.weed_hits enable row level security;

drop policy if exists "Users can update their own weed hits"
  on public.weed_hits;

create policy "Users can update their own weed hits"
  on public.weed_hits
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update on table public.weed_hits to authenticated;
