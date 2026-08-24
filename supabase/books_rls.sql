alter table public.books
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.books
set user_id = '605f4c7b-4d2d-4f7d-b215-1461cf1a5779'
where user_id is null;

alter table public.books
  alter column user_id set default auth.uid(),
  alter column user_id set not null;

alter table public.books enable row level security;

drop policy if exists "Users can view their own books" on public.books;
create policy "Users can view their own books"
  on public.books for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own books" on public.books;
create policy "Users can insert their own books"
  on public.books for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own books" on public.books;
create policy "Users can update their own books"
  on public.books for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own books" on public.books;
create policy "Users can delete their own books"
  on public.books for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists books_user_id_idx on public.books (user_id);
