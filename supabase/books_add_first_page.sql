alter table public.books
  add column if not exists first_page integer check (first_page >= 0);

drop function if exists public.save_reading_progress(uuid, integer, integer, text, date, boolean, numeric);

create or replace function public.save_reading_progress(
  p_book_id uuid,
  p_page_number integer,
  p_first_page integer,
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
      first_page = p_first_page,
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

revoke all on function public.save_reading_progress(uuid, integer, integer, integer, text, date, boolean, numeric) from public;
revoke all on function public.save_reading_progress(uuid, integer, integer, integer, text, date, boolean, numeric) from anon;
grant execute on function public.save_reading_progress(uuid, integer, integer, integer, text, date, boolean, numeric) to authenticated;
