"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BookEditor, { type BookRecord } from "../BookEditor";

function sortReadBooks(books: BookRecord[]) {
  return [...books].sort((a, b) => {
    const dateReadDifference = (b.date_read ?? "").localeCompare(a.date_read ?? "");
    if (dateReadDifference !== 0) return dateReadDifference;

    if (a.date_added === null || b.date_added === null) {
      if (a.date_added !== b.date_added) return a.date_added === null ? 1 : -1;
    }

    return (b.date_added ?? "").localeCompare(a.date_added ?? "");
  });
}

function formatDate(date: string | null) {
  if (!date) return "Date unknown";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}/${day}/${year}` : date;
}

export default function ReadBooksPage() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingRereadId, setCreatingRereadId] = useState<string | null>(null);
  const [rereadMessage, setRereadMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("books")
      .select("id,owned,reading_status,title,author,pages,original_pub_year,date_added,date_read,rank,re_read,source,first_page,pages_of_text,current_page,notes,rating")
      .eq("reading_status", "read")
      .order("date_read", { ascending: false, nullsFirst: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setBooks(sortReadBooks((data ?? []) as BookRecord[]));
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return books;
    return books.filter((book) => `${book.title} ${book.author ?? ""}`.toLowerCase().includes(query));
  }, [books, search]);

  const readThisYear = books.filter((book) => book.date_read?.startsWith(String(new Date().getFullYear()))).length;

  async function createReread(book: BookRecord) {
    if (creatingRereadId) return;

    const now = new Date();
    const dateAdded = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setCreatingRereadId(book.id);
    setRereadMessage(null);
    setError(null);

    const { error: insertError } = await supabase.from("books").insert({
      owned: book.owned,
      reading_status: "unread",
      title: book.title,
      author: book.author,
      pages: book.pages,
      original_pub_year: book.original_pub_year,
      date_added: dateAdded,
      date_read: null,
      rank: null,
      re_read: true,
      source: book.source,
      first_page: book.first_page,
      pages_of_text: book.pages_of_text,
      current_page: null,
      notes: book.notes,
      rating: null,
    });

    if (insertError) setError(`Reread creation failed: ${insertError.message}`);
    else setRereadMessage(`${book.title} was added to To Read as a reread.`);
    setCreatingRereadId(null);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Read Books</h1>
          <div className="mt-2 text-sm text-white/60">{loading ? "…" : `${books.length} books — ${readThisYear} read this year`}</div>
          <Link href="/books" className="mt-2 inline-block text-sm text-white/60 underline underline-offset-4 hover:text-white">Back</Link>
        </header>

        <div className="mb-4 flex justify-center">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." className="h-10 w-full max-w-xs rounded-xl border border-white/10 bg-white/5 px-3 text-[16px] text-white placeholder:text-white/40 outline-none focus:border-white/20" />
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_60px_rgba(0,0,0,0.65)]">
          {rereadMessage ? <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-white/70">{rereadMessage}</div> : null}
          {error ? <div className="py-10 text-center text-red-300">{error}</div> : loading ? (
            <div className="py-10 text-center text-white/60">Loading…</div>
          ) : filteredBooks.length === 0 ? (
            <div className="py-10 text-center text-white/60">{search ? "No matches." : "No read books yet."}</div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredBooks.map((book) => (
                <div
                  key={book.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId((current) => current === book.id ? null : book.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpandedId((current) => current === book.id ? null : book.id);
                    }
                  }}
                  className="rounded-xl px-1 py-3 transition hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-[14px] font-semibold leading-[18px]">{book.title}</div>
                    <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
                      <div className="truncate text-[12px] text-white/50">{book.author ?? "Unknown author"}{book.re_read ? " · Re-read" : ""}</div>
                      <div className="flex shrink-0 items-center gap-1.5">
                      <div className="text-right text-[11px] tabular-nums text-white/55">{formatDate(book.date_read)}</div>
                      <button
                        type="button"
                        aria-label={`Create a reread of ${book.title}`}
                        title="Reread"
                        disabled={creatingRereadId !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          createReread(book);
                        }}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 text-base leading-none text-white/85 transition hover:bg-white/10 active:scale-[0.97] disabled:opacity-40"
                      >
                        {creatingRereadId === book.id ? "…" : "+"}
                      </button>
                      </div>
                    </div>
                  </div>

                  {expandedId === book.id ? (
                    <BookEditor
                      book={book}
                      onSaved={(updated) => {
                        setBooks((current) => updated.reading_status === "read"
                          ? sortReadBooks(current.map((item) => item.id === updated.id ? updated : item))
                          : current.filter((item) => item.id !== updated.id));
                        setExpandedId(null);
                      }}
                      onDeleted={(id) => {
                        setBooks((current) => current.filter((item) => item.id !== id));
                        setExpandedId(null);
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
