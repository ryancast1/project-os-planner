"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BookEditor, { type BookRecord } from "../BookEditor";
import LongPressTitle from "../LongPressTitle";

function sortToRead(books: BookRecord[]) {
  return [...books].sort((a, b) => {
    const group = (book: BookRecord) => book.rank === null ? 2 : book.rank === 99 ? 1 : 0;
    const groupDifference = group(a) - group(b);
    if (groupDifference !== 0) return groupDifference;
    if (group(a) === 0 && a.rank !== b.rank) return (a.rank ?? 0) - (b.rank ?? 0);
    if (a.date_added === null || b.date_added === null) {
      if (a.date_added !== b.date_added) return a.date_added === null ? 1 : -1;
    }

    return (b.date_added ?? "").localeCompare(a.date_added ?? "") || a.title.localeCompare(b.title);
  });
}

export default function BookListPage() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("books")
      .select("id,owned,reading_status,title,author,pages,original_pub_year,date_added,date_read,rank,re_read,source,pages_of_text,current_page,notes")
      .eq("reading_status", "unread")
      .order("rank", { ascending: true, nullsFirst: false })
      .order("date_added", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setBooks(sortToRead((data ?? []) as BookRecord[]));
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return books;
    return books.filter((book) =>
      `${book.title} ${book.author ?? ""}`.toLowerCase().includes(query)
    );
  }, [books, search]);

  async function addToOnDeck(id: string) {
    setBusyId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from("books")
      .update({ rank: 99 })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setBusyId(null);
      return;
    }

    setBooks((current) => sortToRead(current.map((book) => book.id === id ? { ...book, rank: 99 } : book)));
    setBusyId(null);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">To Read List</h1>
          <div className="mt-2 text-sm text-white/60">{loading ? "…" : `${books.length} unread ${books.length === 1 ? "book" : "books"}`}</div>
          <Link href="/books" className="mt-2 inline-block text-sm text-white/60 underline underline-offset-4 hover:text-white">Back</Link>
        </header>

        <div className="mb-4 flex justify-center">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." className="h-10 w-full max-w-xs rounded-xl border border-white/10 bg-white/5 px-3 text-[16px] text-white placeholder:text-white/40 outline-none focus:border-white/20" />
        </div>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_10px_60px_rgba(0,0,0,0.65)]">
          {error ? <div className="py-10 text-center text-red-300">{error}</div> : loading ? (
            <div className="py-10 text-center text-white/60">Loading…</div>
          ) : filteredBooks.length === 0 ? (
            <div className="py-10 text-center text-white/60">{search ? "No matches." : "No unread books yet."}</div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredBooks.map((book) => (
                <div key={book.id} className="px-2 py-1">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId((current) => current === book.id ? null : book.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedId((current) => current === book.id ? null : book.id);
                      }
                    }}
                    className="rounded-xl px-1 py-2 transition hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <LongPressTitle title={book.title} className="line-clamp-2 text-[14px] font-semibold leading-[18px]" />
                      <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
                        <div className="truncate text-[12px] text-white/50">{book.author ?? "Unknown author"}</div>
                        <div className="shrink-0">
                        {book.rank !== null ? (
                          <div className="min-w-8 text-center text-xs font-semibold tabular-nums text-white/65">
                            {book.rank === 99 ? "OD" : book.rank}
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === book.id}
                            aria-label={`Add ${book.title} to On Deck`}
                            onClick={(event) => {
                              event.stopPropagation();
                              addToOnDeck(book.id);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-lg font-semibold text-white/85 transition active:scale-[0.98] disabled:opacity-50"
                          >
                            +
                          </button>
                        )}
                        </div>
                      </div>
                    </div>

                    {expandedId === book.id ? (
                      <BookEditor
                        book={book}
                        onSaved={(updated) => {
                          setBooks((current) => updated.reading_status === "unread"
                            ? sortToRead(current.map((item) => item.id === updated.id ? updated : item))
                            : current.filter((item) => item.id !== updated.id));
                          if (updated.reading_status !== "unread") setExpandedId(null);
                        }}
                        onDeleted={(id) => {
                          setBooks((current) => sortToRead(current
                            .filter((item) => item.id !== id)
                            .map((item) => book.rank !== null && book.rank !== 99 && item.rank !== null && item.rank !== 99 && item.rank > book.rank
                              ? { ...item, rank: item.rank - 1 }
                              : item)));
                          setExpandedId(null);
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
