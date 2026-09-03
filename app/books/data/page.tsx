"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ReadingLog = {
  pages_read: number;
  logged_on: string;
};

type ReadBook = {
  id: string;
  date_read: string | null;
  first_page: number | null;
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
  const totals = new Map<string, number>();
  for (const log of logs) {
    totals.set(log.logged_on, (totals.get(log.logged_on) ?? 0) + log.pages_read);
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

function BarChart({ data, unit, fitAll = false, showValues = true }: { data: BarDatum[]; unit: string; fitAll?: boolean; showValues?: boolean }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const maximum = Math.max(1, ...data.map((item) => item.value));
  const activeItem = data.find((item) => item.key === activeKey) ?? null;
  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  if (data.length === 0) {
    return <div className="py-10 text-center text-sm text-white/45">No data yet.</div>;
  }

  return (
    <div className={`relative pb-1 ${fitAll ? "overflow-hidden" : "overflow-x-auto"}`}>
      {fitAll && activeItem ? (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-md bg-zinc-800 px-2 py-1 text-xs tabular-nums text-white shadow-lg">
          {activeItem.label} · {activeItem.value} {activeItem.value === 1 && unit === "pages" ? "page" : unit}
        </div>
      ) : null}
      <div
        className={`flex h-56 items-end border-b border-white/15 px-1 pt-7 ${fitAll ? "gap-px" : "gap-2"}`}
        style={fitAll ? undefined : { minWidth: `max(100%, ${data.length * 42}px)` }}
      >
        {data.map((item, index) => (
          <button
            key={item.key}
            type="button"
            aria-label={`${item.label}: ${item.value} ${unit}`}
            onPointerEnter={() => setActiveKey(item.key)}
            onPointerDown={() => setActiveKey(item.key)}
            onFocus={() => setActiveKey(item.key)}
            className={`flex h-full flex-1 flex-col items-center justify-end p-0 text-inherit ${fitAll ? "min-w-0" : "min-w-8"}`}
          >
            {showValues ? <div className="mb-1 text-[11px] tabular-nums text-white/65">{item.value}</div> : null}
            <div
              className={`w-full rounded-t-sm transition-[height] ${item.key === activeKey ? "bg-white" : "bg-white/80"} ${fitAll ? "max-w-5" : "max-w-10"}`}
              style={{ height: `${item.value === 0 ? 2 : Math.max(7, (item.value / maximum) * 155)}px` }}
              title={`${item.label}: ${item.value} ${unit}`}
            />
            <div className="mt-2 h-3 whitespace-nowrap text-[10px] text-white/45">
              {!fitAll || index === 0 || index === data.length - 1 || index % labelStep === 0 ? item.label : ""}
            </div>
          </button>
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
      supabase.from("reading_log").select("pages_read,logged_on").order("logged_on"),
      supabase.from("books").select("id,date_read,first_page"),
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
            {loading ? <div className="py-10 text-center text-sm text-white/45">Loading…</div> : <BarChart data={pages} unit="pages" fitAll showValues={false} />}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-1 text-lg font-semibold">Books Read Per Year</div>
            {loading ? <div className="py-10 text-center text-sm text-white/45">Loading…</div> : <BarChart data={years} unit="books" />}
          </section>
        </div>
      </div>
    </main>
  );
}
