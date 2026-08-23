"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const actions = [
  { label: "Add a Book", href: "/books/add", variant: "primary" as const },
  { label: "View Book List", href: "/books/list", variant: "secondary" as const },
  { label: "Read Books", href: "/books/read", variant: "secondary" as const },
];

type Book = {
  id: string;
  title: string;
  author: string | null;
  pages: number | null;
  original_pub_year: number | null;
  rank: number | null;
  source: string | null;
  notes: string | null;
  reading_status: "unread" | "reading" | "read";
};

function sortByRank(books: Book[]) {
  return [...books].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.title.localeCompare(b.title));
}

export default function BooksPage() {
  const [rows, setRows] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("books")
      .select("id,title,author,pages,original_pub_year,rank,source,notes,reading_status")
      .order("rank", { ascending: true, nullsFirst: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setRows((data ?? []) as Book[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const onDeck = useMemo(
    () => sortByRank(rows.filter((book) => book.reading_status === "unread" && book.rank !== null)),
    [rows]
  );
  const currentlyReading = useMemo(
    () => rows.filter((book) => book.reading_status === "reading"),
    [rows]
  );

  const highestNumberedRank = useMemo(
    () => Math.max(0, ...onDeck.filter((book) => book.rank !== 99).map((book) => book.rank ?? 0)),
    [onDeck]
  );

  async function moveBook(id: string, direction: "up" | "down") {
      const book = onDeck.find((item) => item.id === id);
      if (!book || book.rank === null) return;

      if (book.rank === 99) {
        if (direction === "down") {
          setRows((current) => current.map((item) => item.id === id ? { ...item, rank: null } : item));
          const { error: updateError } = await supabase.from("books").update({ rank: null }).eq("id", id);
          if (updateError) setError(updateError.message);
          return;
        }
        const nextRank = Math.max(1, highestNumberedRank + 1);
        setRows((current) => current.map((item) => item.id === id ? { ...item, rank: nextRank } : item));
        const { error: updateError } = await supabase.from("books").update({ rank: nextRank }).eq("id", id);
        if (updateError) setError(updateError.message);
        return;
      }

      if (book.rank === 1 && direction === "up") return;

      const targetRank = direction === "up" ? book.rank - 1 : book.rank + 1;
      const target = onDeck.find((item) => item.rank === targetRank);

      if (direction === "down" && book.rank === highestNumberedRank && !target) {
        setRows((current) => current.map((item) => item.id === id ? { ...item, rank: 99 } : item));
        const { error: updateError } = await supabase.from("books").update({ rank: 99 }).eq("id", id);
        if (updateError) setError(updateError.message);
        return;
      }

      setRows((current) =>
        current.map((item) => {
          if (item.id === id) return { ...item, rank: targetRank };
          if (target && item.id === target.id) return { ...item, rank: book.rank };
          return item;
        })
      );
      const updates = [supabase.from("books").update({ rank: targetRank }).eq("id", id)];
      if (target) updates.push(supabase.from("books").update({ rank: book.rank }).eq("id", target.id));
      const results = await Promise.all(updates);
      const updateError = results.find((result) => result.error)?.error;
      if (updateError) setError(updateError.message);
  }

  async function startReading(id: string) {
    const book = onDeck.find((item) => item.id === id);
    if (!book) return;
    setRows((current) => current.map((item) => item.id === id ? { ...item, reading_status: "reading", rank: null } : item));
    setExpandedId(null);
    const { error: updateError } = await supabase
      .from("books")
      .update({ reading_status: "reading", rank: null })
      .eq("id", id);
    if (updateError) setError(updateError.message);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-3 py-8 text-white sm:px-5">
      <div className="mx-auto w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl">
        <header className="relative mb-6">
          <h1 className="text-center text-3xl font-semibold tracking-tight">Books</h1>
          <Link
            href="/"
            className="absolute right-0 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-[0.97]"
            aria-label="Home"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
            </svg>
          </Link>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={
                  action.variant === "primary"
                    ? "grid h-14 w-full place-items-center rounded-xl bg-white text-lg font-semibold text-black shadow-lg transition active:scale-[0.99]"
                    : "grid h-14 w-full place-items-center rounded-xl border border-white/10 bg-white/5 text-lg font-semibold text-white shadow-lg transition active:scale-[0.99]"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-baseline justify-between px-4 pb-3 pt-4">
            <div className="text-lg font-semibold">Currently Reading</div>
            <div className="text-sm text-white/55">
              {loading ? "…" : `${currentlyReading.length} ${currentlyReading.length === 1 ? "book" : "books"}`}
            </div>
          </div>
          <div className="px-2 pb-2">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              {error ? (
                <div className="p-3 text-sm text-red-300">{error}</div>
              ) : loading ? (
                <div className="p-3 text-sm text-white/60">Loading…</div>
              ) : currentlyReading.length === 0 ? (
                <div className="p-3 text-sm text-white/60">No books currently being read.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {currentlyReading.map((book) => (
                    <div key={book.id} className="px-3 py-3">
                      <div className="font-semibold">{book.title}</div>
                      <div className="mt-0.5 text-sm text-white/50">{book.author ?? "Unknown author"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-baseline justify-between px-4 pb-3 pt-4">
            <div className="text-lg font-semibold">Books on Deck</div>
            <div className="text-sm text-white/55">
              {loading ? "…" : `${onDeck.length} ${onDeck.length === 1 ? "item" : "items"}`}
            </div>
          </div>

          <div className="px-1 pb-2 sm:px-2">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              {error ? (
                <div className="p-3 text-sm text-red-300">{error}</div>
              ) : loading ? (
                <div className="p-3 text-sm text-white/60">Loading…</div>
              ) : onDeck.length === 0 ? (
                <div className="p-3 text-sm text-white/60">No prioritized books yet.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {onDeck.map((book) => {
                    const isOpen = expandedId === book.id;
                    return (
                      <div key={book.id} className="px-2">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId((current) => (current === book.id ? null : book.id))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setExpandedId((current) => (current === book.id ? null : book.id));
                            }
                          }}
                          className="rounded-lg px-1.5 py-2 transition hover:bg-white/5 sm:px-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[15px] font-semibold sm:text-[16px]">{book.title}</div>
                              <div className="truncate text-[12px] text-white/45 sm:text-[13px]">
                                {book.author ?? "Unknown author"}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <div className="w-12 text-right text-[12px] tabular-nums text-white/60">
                                {book.pages ? `${book.pages}p` : ""}
                              </div>
                              <button
                                type="button"
                                aria-label={`Move ${book.title} up`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveBook(book.id, "up");
                                }}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-[13px] text-white/85 transition active:scale-[0.98]"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${book.title} down`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveBook(book.id, "down");
                                }}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-[13px] text-white/85 transition active:scale-[0.98]"
                              >
                                ▼
                              </button>
                              <div className="w-7 text-right text-[12px] tabular-nums text-white/65">
                                {book.rank === 99 ? "OD" : book.rank}
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startReading(book.id);
                                }}
                                className="h-9 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-white/90 transition active:scale-[0.98]"
                              >
                                Start
                              </button>
                            </div>
                          </div>

                          {isOpen ? (
                            <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[13px] text-white/70">
                              <div><span className="text-white/45">Published: </span>{book.original_pub_year ?? "—"}</div>
                              <div className="mt-1"><span className="text-white/45">Source: </span>{book.source ?? "—"}</div>
                              <div className="mt-1 whitespace-pre-wrap"><span className="text-white/45">Notes: </span>{book.notes ?? "—"}</div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
