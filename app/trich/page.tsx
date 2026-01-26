"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PACIFIC_TZ = "America/Los_Angeles";

type DailyRow = { date: string; t1: number; t2: number };

function pacificISODate(d = new Date()) {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isoToMDY(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function dateFromISO(iso: string) {
  // Noon UTC avoids DST edge weirdness while still mapping cleanly to the intended date label
  return new Date(`${iso}T12:00:00Z`);
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);

  const [today, setToday] = useState(() => pacificISODate());

  const [t1, setT1] = useState(0);
  const [t2, setT2] = useState(0);
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Calculate weighted rolling index for chart
  // Weights: today = 1.0, yesterday = 0.95, -2d = 0.90, ..., -18d = 0.10, -19d = 0.05, -20d = 0.025
  // Uses T1 + T2 total for each day
  const indexData = useMemo(() => {
    // dailyRows is ordered newest first, so reverse to get chronological order
    const chronological = [...dailyRows].reverse();
    if (chronological.length < 21) return []; // Need at least 21 days for full calculation

    const weights = [
      1.0,    // day 0 (current day in window)
      0.95,   // day -1
      0.90,   // day -2
      0.85,   // day -3
      0.80,   // day -4
      0.75,   // day -5
      0.70,   // day -6
      0.65,   // day -7
      0.60,   // day -8
      0.55,   // day -9
      0.50,   // day -10
      0.45,   // day -11
      0.40,   // day -12
      0.35,   // day -13
      0.30,   // day -14
      0.25,   // day -15
      0.20,   // day -16
      0.15,   // day -17
      0.10,   // day -18
      0.05,   // day -19
      0.025,  // day -20
    ];

    const result: { date: string; index: number }[] = [];

    // Start from day 20 (21st day, 0-indexed) since we need 21 days of history
    for (let i = 20; i < chronological.length; i++) {
      let sum = 0;
      for (let j = 0; j < 21; j++) {
        const dayData = chronological[i - j];
        const total = dayData.t1 + dayData.t2;
        sum += total * weights[j];
      }
      result.push({ date: chronological[i].date, index: sum });
    }

    return result;
  }, [dailyRows]);

  // Keep "today" updated (Pacific midnight boundary)
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = pacificISODate();
      setToday((prev) => (prev === t ? prev : t));
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Get user once
  useEffect(() => {
    (async () => {
      setErr(null);
      setStatus("loading");

      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setErr(error.message);
        setStatus("error");
        return;
      }

      const id = data.user?.id ?? null;
      setUserId(id);

      if (!id) {
        setErr("Not logged in.");
        setStatus("error");
        return;
      }

      setStatus("idle");
    })();
  }, []);

  // Load data whenever user or "today" changes (so it flips after Pacific midnight)
  useEffect(() => {
    if (!userId) return;
    loadDailyAndToday(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today]);

  async function fetchAllEvents(uid: string) {
    const pageSize = 1000;
    let from = 0;

    const all: { occurred_on: string; trich: number }[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("trich_events")
        .select("occurred_on, trich")
        .eq("user_id", uid)
        .order("occurred_on", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const rows = (data ?? []) as { occurred_on: string; trich: number }[];
      all.push(...rows);

      if (rows.length < pageSize) break;
      from += pageSize;

      if (from > 50000) break; // safety valve
    }

    return all;
  }

  async function loadDailyAndToday(uid: string) {
    setErr(null);
    setStatus("loading");

    try {
      const events = await fetchAllEvents(uid);

      // Aggregate by occurred_on (Pacific-day bucket)
      const byDay = new Map<string, { t1: number; t2: number }>();
      for (const e of events) {
        const day = e.occurred_on;
        const cur = byDay.get(day) ?? { t1: 0, t2: 0 };
        if (Number(e.trich) === 1) cur.t1 += 1;
        else if (Number(e.trich) === 2) cur.t2 += 1;
        byDay.set(day, cur);
      }

      // Find the earliest date with data
      const allDates = Array.from(byDay.keys()).sort();
      const startDateISO = allDates.length > 0 ? allDates[0] : today;

      // Build continuous daily rows from Pacific "today" back to start date
      const out: DailyRow[] = [];
      const start = dateFromISO(startDateISO);
      let d = dateFromISO(today);

      for (; d >= start; d = new Date(d.getTime() - 86400000)) {
        const iso = pacificISODate(d); // label each row in Pacific
        const agg = byDay.get(iso) ?? { t1: 0, t2: 0 };
        out.push({ date: iso, t1: agg.t1, t2: agg.t2 });
      }

      setDailyRows(out);

      const todayAgg = byDay.get(today) ?? { t1: 0, t2: 0 };
      setT1(todayAgg.t1);
      setT2(todayAgg.t2);

      setStatus("idle");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load data.");
      setStatus("error");
    }
  }

  function csvEscape(v: unknown) {
    const s = v == null ? "" : String(v);
    // Quote if it contains comma, quote, or newline
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadTextFile(filename: string, text: string, mime = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function fetchEventsForExport(uid: string) {
    // Try to include a timestamp column. Fall back if the project used a different name.
    const timestampCandidates = ["created_at", "submitted_at", "inserted_at", "timestamp", "ts"];

    // Page through results to avoid row limits.
    const pageSize = 1000;
    let from = 0;

    // We'll pick the first timestamp column that works.
    let tsCol: string | null = null;

    // Helper that runs one page query with a chosen timestamp column
    async function runPage(sel: string) {
      const q = supabase
        .from("trich_events")
        .select(sel)
        .eq("user_id", uid);

      // Order by timestamp if available, otherwise by occurred_on.
      const ordered = tsCol ? q.order(tsCol, { ascending: true }) : q.order("occurred_on", { ascending: true });
      return ordered.range(from, from + pageSize - 1);
    }

    // First, detect which timestamp column exists (if any)
    for (const c of timestampCandidates) {
      const { error } = await supabase
        .from("trich_events")
        .select(`occurred_on,trich,${c}`)
        .eq("user_id", uid)
        .order("occurred_on", { ascending: false })
        .range(0, 0);

      if (!error) {
        tsCol = c;
        break;
      }

      // If the error is NOT about a missing column, stop trying and just proceed without ts.
      const msg = (error as any)?.message ?? "";
      if (msg && !msg.toLowerCase().includes("does not exist")) break;
    }

    const all: Array<{ occurred_on: string; trich: number; ts?: string | null }> = [];

    while (true) {
      const sel = tsCol ? `occurred_on,trich,${tsCol}` : "occurred_on,trich";
      const { data, error } = await runPage(sel);
      if (error) throw error;

      const rows = (data ?? []) as any[];
      for (const r of rows) {
        all.push({
          occurred_on: r.occurred_on,
          trich: Number(r.trich),
          ts: tsCol ? (r[tsCol] ?? null) : null,
        });
      }

      if (rows.length < pageSize) break;
      from += pageSize;
      if (from > 50000) break; // safety valve
    }

    return { rows: all, tsCol };
  }

  async function exportCsv() {
    if (!userId) return;

    setExportErr(null);
    setExporting(true);

    try {
      const { rows, tsCol } = await fetchEventsForExport(userId);

      // Header
      const header = [
        "occurred_on",
        "trich",
        "timestamp",
      ];

      const lines: string[] = [];
      lines.push(header.join(","));

      for (const r of rows) {
        const timestamp = r.ts ?? "";
        lines.push([
          csvEscape(r.occurred_on),
          csvEscape(r.trich),
          csvEscape(timestamp),
        ].join(","));
      }

      // Helpful comment at top if we couldn't find a timestamp column
      const csvBody = lines.join("\n");
      const prefix = tsCol ? "" : "# NOTE: No timestamp column found on trich_events; exported occurred_on + trich only.\n";

      const filename = `trich-events-${today}.csv`;
      downloadTextFile(filename, prefix + csvBody);
    } catch (e: any) {
      setExportErr(e?.message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function log(n: 1 | 2) {
    if (!userId) return;

    setErr(null);
    setStatus("saving");

    const occurredOn = pacificISODate(); // compute at tap time (Pacific day boundary)

    // optimistic bump only if it’s for the currently displayed "today"
    if (occurredOn === today) {
      if (n === 1) setT1((x) => x + 1);
      if (n === 2) setT2((x) => x + 1);
    }

    const { error } = await supabase.from("trich_events").insert({
      user_id: userId,
      trich: n,
      occurred_on: occurredOn,
    });

    if (error) {
      if (occurredOn === today) {
        if (n === 1) setT1((x) => Math.max(0, x - 1));
        if (n === 2) setT2((x) => Math.max(0, x - 1));
      }
      setErr(error.message);
      setStatus("error");
      return;
    }

    await loadDailyAndToday(userId);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-10 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-center">Trich Tracker</h1>
          <div className="mt-2 text-center text-xs text-white/50">
            {isoToMDY(today)}
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => log(1)}
              disabled={!userId || status === "saving" || status === "loading"}
              className="h-32 rounded-2xl bg-white text-black disabled:opacity-60 active:scale-[0.99] transition flex flex-col items-center justify-center"
            >
              <div className="text-3xl font-semibold">T1</div>
              <div className="mt-1 text-5xl font-bold tabular-nums">{t1}</div>
            </button>

            <button
              onClick={() => log(2)}
              disabled={!userId || status === "saving" || status === "loading"}
              className="h-32 rounded-2xl bg-white text-black disabled:opacity-60 active:scale-[0.99] transition flex flex-col items-center justify-center"
            >
              <div className="text-3xl font-semibold">T2</div>
              <div className="mt-1 text-5xl font-bold tabular-nums">{t2}</div>
            </button>
          </div>

          {err && <div className="mt-4 text-center text-sm text-red-300">{err}</div>}
          <div className="mt-3 text-center text-xs text-white/50">
            {status === "loading" ? "Loading…" : status === "saving" ? "Saving…" : ""}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 text-center text-xs text-white/60">Daily totals</div>

          <div className="max-h-[360px] overflow-y-auto rounded-xl border border-white/10">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-white/10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-white/70">Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-white/70">T1</th>
                  <th className="px-3 py-2 text-right font-semibold text-white/70">T2</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((r) => {
                  const isZeroDay = r.t1 === 0 && r.t2 === 0;
                  return (
                  <tr key={r.date} className={`border-t border-white/5 ${isZeroDay ? "bg-emerald-500/20" : ""}`}>
                    <td className={`px-3 py-2 text-left ${isZeroDay ? "text-emerald-300" : "text-white/80"}`}>{isoToMDY(r.date)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${isZeroDay ? "text-emerald-300" : "text-white/90"}`}>{r.t1}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${isZeroDay ? "text-emerald-300" : "text-white/90"}`}>{r.t2}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={exportCsv}
            disabled={!userId || exporting || status === "loading"}
            className="mt-3 w-full h-12 rounded-xl border border-white/10 bg-white/5 text-white font-semibold disabled:opacity-60 active:scale-[0.99] transition"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>

          {exportErr && <div className="mt-3 text-center text-sm text-red-300">{exportErr}</div>}
        </section>

        {/* Weighted Index Chart */}
        {indexData.length >= 2 && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-white/60">21-Day Weighted Index</div>
              <div className="text-xs text-white/50">
                Current: {indexData.length > 0 ? indexData[indexData.length - 1].index.toFixed(1) : "—"}
              </div>
            </div>
            <TrichIndexChart data={indexData} />
          </section>
        )}
      </div>
    </main>
  );
}

function TrichIndexChart({ data }: { data: { date: string; index: number }[] }) {
  const indices = data.map((d) => d.index);
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);
  const spread = Math.max(1, maxIdx - minIdx);
  const yMin = Math.max(0, minIdx - spread * 0.1);
  const yMax = maxIdx + spread * 0.1;

  const n = data.length;

  const fmt = (iso: string) => {
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    return `${m}/${d}`;
  };

  const firstDate = data[0]?.date ?? "";
  const lastDate = data[data.length - 1]?.date ?? "";

  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 relative h-[200px]">
      {/* Y axis labels - HTML positioned */}
      <div className="absolute left-1 top-1 text-[9px] text-white/50">{Math.round(yMax)}</div>
      <div className="absolute left-1 bottom-5 text-[9px] text-white/50">{Math.round(yMin)}</div>

      {/* X axis labels - HTML positioned */}
      <div className="absolute left-7 bottom-1 text-[9px] text-white/45">{fmt(firstDate)}</div>
      <div className="absolute right-2 bottom-1 text-[9px] text-white/45">{fmt(lastDate)}</div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        {/* Baseline */}
        <line x1="8" y1="92" x2="97" y2="92" stroke="rgba(255,255,255,0.10)" />

        {/* Index line */}
        <polyline
          fill="none"
          stroke="rgba(251,146,60,0.9)"
          strokeWidth="0.6"
          points={data
            .map((d, i) => {
              const xPct = 8 + (i / (n - 1)) * 89;
              const yPct = 92 - ((d.index - yMin) / (yMax - yMin)) * 84;
              return `${xPct},${yPct}`;
            })
            .join(" ")}
        />

        {/* Latest point */}
        {(() => {
          const xPct = 97;
          const yPct = 92 - ((data[n - 1].index - yMin) / (yMax - yMin)) * 84;
          return <circle cx={xPct} cy={yPct} r="1" fill="rgba(251,146,60,0.95)" />;
        })()}
      </svg>
    </div>
  );
}
