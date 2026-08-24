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

  useEffect(() => {
    let active = true;
    supabase
      .from("books")
      .select("id,owned,reading_status,title,author,pages,original_pub_year,date_added,date_read,rank,re_read,source,pages_of_text,current_page,notes")
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
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold">{book.title}</div>
                      <div className="truncate text-sm text-white/50">{book.author ?? "Unknown author"}{book.re_read ? " · Re-read" : ""}</div>
                    </div>
                    <div className="shrink-0 text-right text-sm tabular-nums text-white/55">{formatDate(book.date_read)}</div>
                  </div>

                  {expandedId === book.id ? (
                    <BookEditor
                      book={book}
                      onSaved={(updated) => {
                        setBooks((current) => updated.reading_status === "read"
                          ? sortReadBooks(current.map((item) => item.id === updated.id ? updated : item))
                          : current.filter((item) => item.id !== updated.id));
                        if (updated.reading_status !== "read") setExpandedId(null);
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
