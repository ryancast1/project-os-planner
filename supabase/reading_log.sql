drop view if exists public.reading_daily_totals;
drop view if exists public.reading_daily_book_totals;

create table if not exists public.reading_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  logged_on date not null default ((now() at time zone 'America/New_York' - interval '4 hours')::date),
  created_at timestamptz not null default now()
);

alter table public.reading_log
  alter column logged_on
  set default ((now() at time zone 'America/New_York' - interval '4 hours')::date);

create index if not exists reading_log_user_date_idx
  on public.reading_log (user_id, logged_on desc);

create index if not exists reading_log_book_date_idx
  on public.reading_log (book_id, logged_on desc, created_at desc);

alter table public.reading_log enable row level security;

drop policy if exists "Users can view their own reading log" on public.reading_log;
create policy "Users can view their own reading log"
  on public.reading_log for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own reading log" on public.reading_log;
create policy "Users can insert their own reading log"
  on public.reading_log for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.books
      where books.id = reading_log.book_id
        and books.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own reading log" on public.reading_log;
create policy "Users can update their own reading log"
  on public.reading_log for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own reading log" on public.reading_log;
create policy "Users can delete their own reading log"
  on public.reading_log for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.save_reading_progress(
  p_book_id uuid,
  p_page_number integer,
  p_pages_of_text integer,
  p_notes text,
  p_logged_on date,
  p_mark_read boolean default false,
  p_rating numeric default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_count integer;
begin
  if p_page_number is null or p_page_number < 1 then
    raise exception 'Page number must be at least 1';
  end if;

  update public.books
  set current_page = p_page_number,
      pages_of_text = p_pages_of_text,
      notes = nullif(trim(p_notes), ''),
      reading_status = case when p_mark_read then 'read' else reading_status end,
      rank = case when p_mark_read then null else rank end,
      date_read = case when p_mark_read then p_logged_on else date_read end,
      rating = case when p_mark_read then p_rating else rating end
  where id = p_book_id
    and user_id = auth.uid();

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Book not found or not owned by current user';
  end if;

  insert into public.reading_log (user_id, book_id, page_number, logged_on)
  values (auth.uid(), p_book_id, p_page_number, p_logged_on);
end;
$$;

revoke all on function public.save_reading_progress(uuid, integer, integer, text, date, boolean, numeric) from public;
revoke all on function public.save_reading_progress(uuid, integer, integer, text, date, boolean, numeric) from anon;
grant execute on function public.save_reading_progress(uuid, integer, integer, text, date, boolean, numeric) to authenticated;
