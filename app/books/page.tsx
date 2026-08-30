"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BookEditor, { type BookRecord } from "./BookEditor";
import CurrentlyReadingEditor from "./CurrentlyReadingEditor";

const actions = [
  { label: "Add a Book", href: "/books/add", variant: "primary" as const },
  { label: "To Read List", href: "/books/list", variant: "secondary" as const },
  { label: "Read Books", href: "/books/read", variant: "secondary" as const },
  { label: "Data", href: "/books/data", variant: "secondary" as const },
];

function sortByRank(books: BookRecord[]) {
  return [...books].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.title.localeCompare(b.title));
}

function percentRead(book: BookRecord) {
  if (book.current_page === null || book.pages_of_text === null) return null;
  const firstPage = book.first_page ?? 1;
  const textLength = book.pages_of_text - firstPage;
  if (textLength <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, ((book.current_page - firstPage) / textLength) * 100)));
}

function readingDate() {
  const adjusted = new Date();
  adjusted.setHours(adjusted.getHours() - 4);
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, "0")}-${String(adjusted.getDate()).padStart(2, "0")}`;
}

export default function BooksPage() {
  const [rows, setRows] = useState<BookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [todayPages, setTodayPages] = useState<number | null>(null);

  const refreshTodayPages = useCallback(async () => {
    const { data, error: pagesError } = await supabase
      .from("reading_log")
      .select("pages_read")
      .eq("logged_on", readingDate());
    if (!pagesError) {
      setTodayPages((data ?? []).reduce((total, row) => total + (row.pages_read ?? 0), 0));
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase
      .from("reading_log")
      .select("pages_read")
      .eq("logged_on", readingDate())
      .then(({ data, error: pagesError }) => {
        if (!active || pagesError) return;
        setTodayPages((data ?? []).reduce((total, row) => total + (row.pages_read ?? 0), 0));
      });
    supabase
      .from("books")
      .select("id,owned,reading_status,title,author,pages,original_pub_year,date_added,date_read,rank,re_read,source,first_page,pages_of_text,current_page,notes,rating")
      .order("rank", { ascending: true, nullsFirst: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setRows((data ?? []) as BookRecord[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTodayPages]);

  const onDeck = useMemo(
    () => sortByRank(rows.filter((book) => book.reading_status === "unread" && book.rank !== null)),
    [rows]
  );
  const currentlyReading = useMemo(
    () => rows
      .filter((book) => book.reading_status === "reading")
      .sort((a, b) => (percentRead(b) ?? -1) - (percentRead(a) ?? -1) || a.title.localeCompare(b.title)),
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

      if (book.rank === 1 && direction === "up") {
        startReading(id);
        return;
      }

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
    const removedRank = book.rank;
    const affected = removedRank !== null && removedRank !== 99
      ? onDeck.filter((item) => item.rank !== null && item.rank !== 99 && item.rank > removedRank)
      : [];

    setRows((current) => current.map((item) => {
      if (item.id === id) return { ...item, reading_status: "reading", rank: null };
      if (affected.some((affectedBook) => affectedBook.id === item.id) && item.rank !== null) {
        return { ...item, rank: item.rank - 1 };
      }
      return item;
    }));
    setExpandedId(null);
    const { error: updateError } = await supabase
      .from("books")
      .update({ reading_status: "reading", rank: null })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    const results = await Promise.all(
      affected.map((affectedBook) =>
        supabase
          .from("books")
          .update({ rank: (affectedBook.rank ?? 1) - 1 })
          .eq("id", affectedBook.id)
      )
    );
    const rebalanceError = results.find((result) => result.error)?.error;
    if (rebalanceError) setError(`Rank update failed: ${rebalanceError.message}`);
  }

  async function moveToTop(id: string) {
    const book = onDeck.find((item) => item.id === id);
    if (!book || book.rank === null || book.rank === 1) return;
    const currentRank = book.rank;

    const affected = onDeck.filter((item) =>
      item.id !== id
      && item.rank !== null
      && item.rank !== 99
      && (currentRank === 99 || item.rank < currentRank)
    );

    setError(null);
    setRows((current) => current.map((item) => {
      if (item.id === id) return { ...item, rank: 1 };
      if (affected.some((affectedBook) => affectedBook.id === item.id) && item.rank !== null) {
        return { ...item, rank: item.rank + 1 };
      }
      return item;
    }));

    const results = await Promise.all([
      supabase.from("books").update({ rank: 1 }).eq("id", id),
      ...affected.map((affectedBook) =>
        supabase.from("books").update({ rank: (affectedBook.rank ?? 0) + 1 }).eq("id", affectedBook.id)
      ),
    ]);
    const updateError = results.find((result) => result.error)?.error;
    if (updateError) {
      setError(`Move to #1 failed: ${updateError.message}`);
      return;
    }
    setExpandedId(null);
  }

  async function returnToOnDeck(id: string) {
    const book = currentlyReading.find((item) => item.id === id);
    if (!book) return;

    const affected = onDeck.filter((item) => item.rank !== null && item.rank !== 99);
    setUpdatingId(id);
    setError(null);
    setRows((current) => current.map((item) => {
      if (item.id === id) return { ...item, reading_status: "unread", rank: 1 };
      if (affected.some((affectedBook) => affectedBook.id === item.id) && item.rank !== null) {
        return { ...item, rank: item.rank + 1 };
      }
      return item;
    }));
    setExpandedId(null);

    const results = await Promise.all([
      supabase.from("books").update({ reading_status: "unread", rank: 1 }).eq("id", id),
      ...affected.map((affectedBook) =>
        supabase
          .from("books")
          .update({ rank: (affectedBook.rank ?? 0) + 1 })
          .eq("id", affectedBook.id)
      ),
    ]);
    const updateError = results.find((result) => result.error)?.error;
    if (updateError) setError(`On Deck update failed: ${updateError.message}`);
    setUpdatingId(null);
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
              {todayPages === null ? "…" : `${todayPages} ${todayPages === 1 ? "page" : "pages"} today`}
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
                      className="px-3 py-3 transition hover:bg-white/5"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[14px] font-semibold leading-[18px]">{book.title}</div>
                          <div className="mt-0.5 truncate text-sm text-white/50">{book.author ?? "Unknown author"}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {percentRead(book) !== null ? (
                            <span className="text-sm tabular-nums text-white/60">{percentRead(book)}%</span>
                          ) : null}
                          <button
                            type="button"
                            aria-label={`Return ${book.title} to On Deck`}
                            title="Return to On Deck"
                            disabled={updatingId === book.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              returnToOnDeck(book.id);
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-[13px] text-white/85 transition active:scale-[0.98] disabled:opacity-50"
                          >
                            ▼
                          </button>
                        </div>
                      </div>

                      {expandedId === book.id ? (
                        <CurrentlyReadingEditor
                          book={book}
                          onSaved={(updated) => {
                            setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
                            setExpandedId(null);
                            void refreshTodayPages();
                          }}
                        />
                      ) : null}
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
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-[14px] font-semibold leading-[18px] sm:text-[15px]">{book.title}</div>
                            <div className="mt-1 flex min-w-0 items-center gap-2">
                              <div className="min-w-0 flex-1 truncate text-[11px] text-white/45 sm:text-[12px]">
                                {book.author ?? "Unknown author"}{book.pages ? ` · ${book.pages}p` : ""}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                              <div className="w-6 text-right text-[11px] tabular-nums text-white/65">
                                {book.rank === 99 ? "OD" : book.rank}
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
                              </div>
                            </div>
                          </div>

                          {isOpen ? (
                            <BookEditor
                              book={book}
                              onMoveToTop={moveToTop}
                              onSaved={(updated) => {
                                setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
                                setExpandedId(null);
                              }}
                              onDeleted={(id) => {
                                setRows((current) => current
                                  .filter((item) => item.id !== id)
                                  .map((item) => book.rank !== null && book.rank !== 99 && item.rank !== null && item.rank !== 99 && item.rank > book.rank
                                    ? { ...item, rank: item.rank - 1 }
                                    : item));
                                setExpandedId(null);
                              }}
                            />
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
