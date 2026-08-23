"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ReadBook = {
  id: string;
  title: string;
  author: string | null;
  pages: number | null;
  date_read: string | null;
  re_read: boolean;
};

export default function ReadBooksPage() {
  const [books, setBooks] = useState<ReadBook[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("books")
      .select("id,title,author,pages,date_read,re_read")
      .eq("reading_status", "read")
      .order("date_read", { ascending: false, nullsFirst: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setBooks((data ?? []) as ReadBook[]);
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
                <div key={book.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{book.title}</div>
                    <div className="truncate text-sm text-white/50">{book.author ?? "Unknown author"}{book.re_read ? " · Re-read" : ""}</div>
                  </div>
                  <div className="shrink-0 text-right text-sm text-white/55">{book.date_read ?? "Date unknown"}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
