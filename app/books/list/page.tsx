"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Book = {
  id: string;
  title: string;
  author: string | null;
  pages: number | null;
  original_pub_year: number | null;
  owned: boolean;
  rank: number | null;
};

export default function BookListPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("books")
      .select("id,title,author,pages,original_pub_year,owned,rank")
      .eq("reading_status", "unread")
      .order("rank", { ascending: true, nullsFirst: false })
      .order("date_added", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setBooks((data ?? []) as Book[]);
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Book List</h1>
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
                <div key={book.id} className="flex items-center justify-between gap-4 px-2 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{book.title}</div>
                    <div className="truncate text-sm text-white/50">
                      {book.author ?? "Unknown author"}{book.original_pub_year ? ` · ${book.original_pub_year}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm text-white/55">
                    {book.pages ? <div>{book.pages} pages</div> : null}
                    <div>{book.rank === 99 ? "On Deck" : book.rank ? `Rank ${book.rank}` : book.owned ? "Owned" : ""}</div>
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
