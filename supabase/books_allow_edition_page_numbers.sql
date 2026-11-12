-- Catalog page counts can describe another edition. Last Page (stored as
-- pages_of_text) and Current Page use the reader's own edition's numbering.
-- Keep the independent nonnegative checks; remove only the catalog upper bounds.
begin;

alter table public.books
  drop constraint if exists pages_of_text_within_book,
  drop constraint if exists current_page_within_book;

commit;
