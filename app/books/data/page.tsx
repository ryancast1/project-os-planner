"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ReadingLog = {
  book_id: string;
  page_number: number;
  logged_on: string;
  created_at: string;
};

type ReadBook = {
  date_read: string | null;
};

type BarDatum = {
  key: string;
  label: string;
  value: number;
};

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function shortDate(value: string) {
  const date = dateAtNoon(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function fillDateRange(values: Map<string, number>) {
  const dates = [...values.keys()].sort();
  if (dates.length === 0) return [];
  const current = dateAtNoon(dates[0]);
  const end = dateAtNoon(dates[dates.length - 1]);
  const result: BarDatum[] = [];

  while (current <= end) {
    const key = dateKey(current);
    result.push({ key, label: shortDate(key), value: values.get(key) ?? 0 });
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function dailyPages(logs: ReadingLog[]) {
  const byBook = new Map<string, ReadingLog[]>();
  for (const log of logs) {
    const entries = byBook.get(log.book_id) ?? [];
    entries.push(log);
    byBook.set(log.book_id, entries);
  }

  const totals = new Map<string, number>();
  for (const entries of byBook.values()) {
    entries.sort((a, b) => a.logged_on.localeCompare(b.logged_on) || a.created_at.localeCompare(b.created_at));
    const finalPageByDay = new Map<string, number>();
    for (const entry of entries) finalPageByDay.set(entry.logged_on, entry.page_number);

    let previousPage = 1;
    for (const [day, finalPage] of [...finalPageByDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      totals.set(day, (totals.get(day) ?? 0) + Math.max(0, finalPage - previousPage));
      previousPage = finalPage;
    }
  }
  return fillDateRange(totals);
}

function booksByYear(books: ReadBook[]) {
  const totals = new Map<number, number>();
  for (const book of books) {
    if (!book.date_read) continue;
    const year = Number(book.date_read.slice(0, 4));
    if (Number.isFinite(year)) totals.set(year, (totals.get(year) ?? 0) + 1);
  }
  const years = [...totals.keys()].sort((a, b) => a - b);
  if (years.length === 0) return [];
  const result: BarDatum[] = [];
  for (let year = years[0]; year <= years[years.length - 1]; year += 1) {
    result.push({ key: String(year), label: String(year), value: totals.get(year) ?? 0 });
  }
  return result;
}

function BarChart({ data, unit }: { data: BarDatum[]; unit: string }) {
  const maximum = Math.max(1, ...data.map((item) => item.value));

  if (data.length === 0) {
    return <div className="py-10 text-center text-sm text-white/45">No data yet.</div>;
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex h-56 items-end gap-2 border-b border-white/15 px-2 pt-7" style={{ minWidth: `max(100%, ${data.length * 42}px)` }}>
        {data.map((item) => (
          <div key={item.key} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end">
            <div className="mb-1 text-[11px] tabular-nums text-white/65" title={`${item.value} ${unit}`}>{item.value}</div>
            <div
              className="w-full max-w-10 rounded-t-md bg-white transition-[height]"
              style={{ height: `${item.value === 0 ? 2 : Math.max(7, (item.value / maximum) * 155)}px` }}
              title={`${item.label}: ${item.value} ${unit}`}
            />
            <div className="mt-2 whitespace-nowrap text-[10px] text-white/45">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BooksDataPage() {
  const [logs, setLogs] = useState<ReadingLog[]>([]);
  const [readBooks, setReadBooks] = useState<ReadBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("reading_log").select("book_id,page_number,logged_on,created_at").order("logged_on").order("created_at"),
      supabase.from("books").select("date_read").eq("reading_status", "read").not("date_read", "is", null),
    ]).then(([logResult, bookResult]) => {
      if (!active) return;
      const loadError = logResult.error ?? bookResult.error;
      if (loadError) setError(loadError.message);
      else {
        setLogs((logResult.data ?? []) as ReadingLog[]);
        setReadBooks((bookResult.data ?? []) as ReadBook[]);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const pages = useMemo(() => dailyPages(logs), [logs]);
  const years = useMemo(() => booksByYear(readBooks), [readBooks]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-3 py-8 text-white sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
        <header className="relative mb-6">
          <h1 className="text-center text-3xl font-semibold tracking-tight">Book Data</h1>
          <Link href="/books" className="absolute left-0 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white">Back</Link>
        </header>

        {error ? <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div> : null}

        <div className="space-y-5">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-1 text-lg font-semibold">Pages Read Per Day</div>
            <div className="mb-3 text-xs text-white/45">From the first reading entry through the latest</div>
            {loading ? <div className="py-10 text-center text-sm text-white/45">Loading…</div> : <BarChart data={pages} unit="pages" />}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-1 text-lg font-semibold">Books Read Per Year</div>
            <div className="mb-3 text-xs text-white/45">Based on Date Read</div>
            {loading ? <div className="py-10 text-center text-sm text-white/45">Loading…</div> : <BarChart data={years} unit="books" />}
          </section>
        </div>
      </div>
    </main>
  );
}
