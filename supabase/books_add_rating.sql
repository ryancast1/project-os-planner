alter table public.books
  add column if not exists rating numeric(2,1);

alter table public.books
  drop constraint if exists books_rating_check;

alter table public.books
  add constraint books_rating_check
  check (
    rating is null
    or (rating between 0.5 and 5 and rating * 2 = trunc(rating * 2))
  );
