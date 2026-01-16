"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function toISODateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  // JS: Sun=0..Sat=6. Convert to Mon=0..Sun=6
  const dowMon0 = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dowMon0);
  return copy;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function dayOfMonthFromISO(iso: string) {
  return Number(iso.slice(8, 10));
}

function monthIndexFromISO(iso: string) {
  return Number(iso.slice(5, 7)) - 1;
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function WatchedCalendarPage() {
  const [watchedDays, setWatchedDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      const start = "2024-01-01";

      try {
        // Pull all watched rows since 1/1/2024 (paged just in case)
        const pageSize = 1000;
        let from = 0;
        let all: Array<{ date_watched: string | null }> = [];

        while (true) {
          const { data, error: qErr } = await supabase
            .from("movie_tracker")
            .select("date_watched")
            .eq("status", "watched")
            .not("date_watched", "is", null)
            .gte("date_watched", start)
            .range(from, from + pageSize - 1);

          if (qErr) throw qErr;

          const chunk = (data ?? []) as Array<{ date_watched: string | null }>;
          all = all.concat(chunk);

          if (chunk.length < pageSize) break;
          from += pageSize;
        }

        const s = new Set<string>();
        for (const r of all) {
          if (r.date_watched) s.add(r.date_watched);
        }

        if (!alive) return;
        setWatchedDays(s);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load watched dates");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const { weekRows, todayISO, startISO } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(2024, 0, 1);
    start.setHours(0, 0, 0, 0);

    const startISO = toISODateLocal(start);
    const todayISO = toISODateLocal(today);

    const currentWeekStart = startOfWeekMonday(today);

    // Build weeks from current week going backwards until we cover 1/1/2024
    const weekRows: Array<{ cells: string[]; monthLabel: string | null }> = [];
    let cursor = new Date(currentWeekStart);

    while (toISODateLocal(addDays(cursor, 6)) >= startISO) {
      const cells: string[] = [];
      for (let i = 0; i < 7; i++) {
        cells.push(toISODateLocal(addDays(cursor, i)));
      }

      // Month label: show on the week row that contains the 1st of a month
      const monthStartISO = cells.find((iso) => iso.slice(8, 10) === "01");
      const monthLabel = monthStartISO ? MONTHS_SHORT[monthIndexFromISO(monthStartISO)] : null;

      weekRows.push({ cells, monthLabel });
      cursor.setDate(cursor.getDate() - 7);
    }

    return { weekRows, todayISO, startISO };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-4 py-6 sm:py-10 text-white flex items-start justify-center">
      <div className="mx-auto w-full max-w-[980px]">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Watched Calendar</h1>
        </header>

        <div
          className="mx-auto w-full rounded-3xl border border-white/10 bg-black/20 p-3 sm:p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_80px_rgba(0,0,0,0.65)]"
          style={{
            ["--cell" as any]: "clamp(20px, 12vw, 34px)",
            ["--grid" as any]: "calc(var(--cell) * 7)",
          }}
        >
          <div
            className="mx-auto mb-3 grid text-center text-[11px] font-medium tracking-wide text-white/55"
            style={{
              width: "var(--grid)",
              gridTemplateColumns: "repeat(7, var(--cell))",
              gap: 0,
            }}
          >
            <div>M</div>
            <div>T</div>
            <div>W</div>
            <div>T</div>
            <div>F</div>
            <div>S</div>
            <div>S</div>
          </div>

          {error ? (
            <div className="text-sm text-red-300">{error}</div>
          ) : (
            <div className="max-h-[calc(100dvh-210px)] overflow-auto">
              <div className="flex justify-center">
                {/* Grid area with side month labels */}
                <div className="relative" style={{ width: "var(--grid)" }}>
                  {/* Month labels (left + right) aligned to week rows */}
                  {weekRows.map((w, rowIdx) => {
                    if (!w.monthLabel) return null;
                    return (
                      <div key={`ml-${rowIdx}`}>
                        <div
                          className="pointer-events-none absolute left-[-26px] text-[10px] font-semibold tracking-wide text-white/40"
                          style={{
                            top: `calc(var(--cell) * ${rowIdx} + (var(--cell) / 2))`,
                            transform: "translateY(-50%) rotate(-90deg)",
                            transformOrigin: "center",
                          }}
                        >
                          {w.monthLabel}
                        </div>
                      </div>
                    );
                  })}

                  {/* Weeks: top row is current week, then backward */}
                  <div className="flex flex-col" style={{ width: "var(--grid)" }}>
                    {weekRows.map((w, rowIdx) => {
                      return (
                        <div
                          key={`row-${rowIdx}`}
                          className="grid"
                          style={{
                            gridTemplateColumns: "repeat(7, var(--cell))",
                            gridAutoRows: "var(--cell)",
                            gap: 0,
                          }}
                        >
                          {w.cells.map((iso, i) => {
                            const inRange = iso >= startISO && iso <= todayISO;
                            const filled = watchedDays.has(iso);

                            // Dim squares outside range (future days / before 1/1/2024).
                            const baseOpacity = inRange ? "opacity-100" : "opacity-35";

                            const dayNum = dayOfMonthFromISO(iso);

                            return (
                              <div
                                key={`${rowIdx}-${i}-${iso}`}
                                title={iso}
                                className={
                                  `relative border border-white/10 ${baseOpacity} ` +
                                  (filled
                                    ? "bg-emerald-500/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                                    : "bg-black/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]")
                                }
                                style={{ borderRadius: "8px" }}
                              >
                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white/35">
                                  {dayNum}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-3 text-center text-sm text-white/60">Loading…</div>
          )}
        </div>
      </div>
    </main>
  );
}