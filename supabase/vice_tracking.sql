-- Run this once in the Supabase SQL Editor.

create table if not exists public.weed_hits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  occurred_on date not null default ((now() at time zone 'America/New_York')::date),
  occurred_at time without time zone not null default ((now() at time zone 'America/New_York')::time(0))
);

create index if not exists weed_hits_user_created_at_idx
  on public.weed_hits (user_id, created_at desc);

create index if not exists weed_hits_user_occurred_on_idx
  on public.weed_hits (user_id, occurred_on desc);

alter table public.weed_hits enable row level security;

drop policy if exists "Users can view their own weed hits" on public.weed_hits;
create policy "Users can view their own weed hits"
  on public.weed_hits for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own weed hits" on public.weed_hits;
create policy "Users can insert their own weed hits"
  on public.weed_hits for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own weed hits" on public.weed_hits;
create policy "Users can delete their own weed hits"
  on public.weed_hits for delete
  using (auth.uid() = user_id);

create table if not exists public.alcohol_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  occurred_on date not null default ((now() at time zone 'America/New_York')::date),
  occurred_at time without time zone not null default ((now() at time zone 'America/New_York')::time(0)),
  amount_oz numeric(7, 2) not null check (amount_oz > 0),
  abv numeric(5, 2) not null check (abv > 0 and abv <= 100),
  label text null check (label is null or char_length(label) <= 120),
  standard_drinks numeric(9, 4) not null check (standard_drinks > 0)
);

create index if not exists alcohol_entries_user_created_at_idx
  on public.alcohol_entries (user_id, created_at desc);

create index if not exists alcohol_entries_user_occurred_on_idx
  on public.alcohol_entries (user_id, occurred_on desc);

alter table public.alcohol_entries enable row level security;

drop policy if exists "Users can view their own alcohol entries" on public.alcohol_entries;
create policy "Users can view their own alcohol entries"
  on public.alcohol_entries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own alcohol entries" on public.alcohol_entries;
create policy "Users can insert their own alcohol entries"
  on public.alcohol_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own alcohol entries" on public.alcohol_entries;
create policy "Users can update their own alcohol entries"
  on public.alcohol_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own alcohol entries" on public.alcohol_entries;
create policy "Users can delete their own alcohol entries"
  on public.alcohol_entries for delete
  using (auth.uid() = user_id);
