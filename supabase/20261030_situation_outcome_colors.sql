-- Run once to sync per-outcome color assignments across devices.
-- The app retains browser-local assignments if this field is not installed yet.
alter table public.situation_markets
  add column if not exists outcome_colors jsonb not null default '{}'::jsonb
  check (jsonb_typeof(outcome_colors) = 'object');

drop policy if exists "Users can update their own situation markets" on public.situation_markets;
create policy "Users can update their own situation markets"
  on public.situation_markets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update (outcome_colors) on public.situation_markets to authenticated;
