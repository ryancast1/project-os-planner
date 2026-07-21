-- Run this once in the Supabase SQL editor.
create table if not exists public.running_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  run_date date not null default current_date,
  duration_seconds integer not null check (duration_seconds > 0),
  distance numeric(8, 2) not null check (distance > 0),
  distance_unit text not null check (distance_unit in ('km', 'mi')),
  temperature_f integer,
  notes text not null default '',
  is_east_river_3k boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists running_runs_user_date_idx
  on public.running_runs (user_id, run_date desc);

create index if not exists running_runs_east_river_idx
  on public.running_runs (user_id, run_date)
  where is_east_river_3k = true;

alter table public.running_runs enable row level security;

drop policy if exists "Users can view their own runs" on public.running_runs;
create policy "Users can view their own runs"
  on public.running_runs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own runs" on public.running_runs;
create policy "Users can insert their own runs"
  on public.running_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own runs" on public.running_runs;
create policy "Users can update their own runs"
  on public.running_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own runs" on public.running_runs;
create policy "Users can delete their own runs"
  on public.running_runs for delete
  using (auth.uid() = user_id);

create or replace function public.set_running_runs_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_running_runs_updated_at on public.running_runs;
create trigger set_running_runs_updated_at
before update on public.running_runs
for each row execute function public.set_running_runs_updated_at();
