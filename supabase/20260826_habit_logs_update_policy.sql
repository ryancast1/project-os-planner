-- The app can currently read, insert, and delete habit_logs, but an UPDATE can
-- be silently filtered to zero rows when no UPDATE policy exists. The database
-- editor uses UPDATE when changing done_on, so explicitly allow signed-in users
-- to edit habit log rows in this personal planner.

alter table public.habit_logs enable row level security;

drop policy if exists "Authenticated users can update habit logs"
  on public.habit_logs;

create policy "Authenticated users can update habit logs"
  on public.habit_logs
  for update
  to authenticated
  using (true)
  with check (true);

grant update on table public.habit_logs to authenticated;
