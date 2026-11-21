"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { localTrackingTime, TRICH_DAY_START_HOUR, trichLogFields } from "@/lib/localTrackingTime";

const EASTERN_TZ = "America/New_York";

type DailyRow = { date: string; t1: number; t2: number; hourly: number[] };
type PullEvent = { occurred_on: string; trich: number; submitted_at: string | null; local_time: string | null };
type IndexPoint = { date: string; index: number };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TRACKING_HOURS = Array.from({ length: 24 }, (_, i) => (i + TRICH_DAY_START_HOUR) % 24);
const EASTERN_HOUR_FORMAT = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TZ, hour: "numeric", hourCycle: "h23" });

function currentTrackingDate() {
  return localTrackingTime(TRICH_DAY_START_HOUR).trackingDate;
}

function isoToMDY(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function dateFromISO(iso: string) {
  // Noon UTC avoids DST edge weirdness while still mapping cleanly to the intended date label
  return new Date(`${iso}T12:00:00Z`);
}

function easternDayStart(iso: string) {
  // At 3am, Eastern's offset is already past any daylight-saving transition.
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(dateFromISO(iso)).find((part) => part.type === "timeZoneName")?.value;
  const hours = Number(offset?.replace("GMT", ""));
  return new Date(`${iso}T03:00:00${hours < 0 ? "-" : "+"}${String(Math.abs(hours)).padStart(2, "0")}:00`).toISOString();
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;
}

function pullHour(event: Pick<PullEvent, "submitted_at" | "local_time">) {
  if (!event.submitted_at) return null;
  if (event.local_time) return Number(event.local_time.split(":")[0]);
  return Number(EASTERN_HOUR_FORMAT.format(new Date(event.submitted_at)));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function isExportQueryRow(value: unknown): value is { occurred_on: string; trich: number; [key: string]: string | number | null } {
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  return typeof row.occurred_on === "string" && (typeof row.trich === "number" || typeof row.trich === "string");
}

function buildWeightedIndexData(dailyRows: DailyRow[], getValue: (row: DailyRow) => number): IndexPoint[] {
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

  const result: IndexPoint[] = [];

  // Start from day 20 (21st day, 0-indexed) since we need 21 days of history
  for (let i = 20; i < chronological.length; i++) {
    let sum = 0;
    for (let j = 0; j < 21; j++) {
      sum += getValue(chronological[i - j]) * weights[j];
    }
    result.push({ date: chronological[i].date, index: sum });
  }

  return result;
}

function buildRegrowthIndexData(dailyRows: DailyRow[], getValue: (row: DailyRow) => number): IndexPoint[] {
  // Excel formula: current day plus 79 prior days at full weight, then 33 older days fade by 0.03/day.
  const chronological = [...dailyRows].reverse();
  const fullWeightDays = 80;
  const fadeDays = 33;
  const windowDays = fullWeightDays + fadeDays;
  if (chronological.length < windowDays) return [];

  const result: IndexPoint[] = [];

  for (let i = windowDays - 1; i < chronological.length; i++) {
    let sum = 0;
    for (let j = 0; j < windowDays; j++) {
      const weight = j < fullWeightDays ? 1 : 1 - (j - fullWeightDays + 1) * 0.03;
      sum += getValue(chronological[i - j]) * weight;
    }
    result.push({ date: chronological[i].date, index: sum });
  }

  return result;
}

function getReplacementLevel(data: IndexPoint[], todayCount: number) {
  if (data.length < 2) return null;

  const yesterdayIndex = data[data.length - 2].index;
  const todayIndexWithoutToday = data[data.length - 1].index - todayCount;
  return Math.max(0, Math.round(yesterdayIndex - todayIndexWithoutToday));
}

function getIndexMax(data: IndexPoint[]) {
  return Math.max(...data.map((point) => point.index));
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);

  const [today, setToday] = useState(() => currentTrackingDate());

  const [t1, setT1] = useState(0);
  const [t2, setT2] = useState(0);
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [offlineEntryOpen, setOfflineEntryOpen] = useState(false);
  const [offlineEntryNotice, setOfflineEntryNotice] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedDayIndex = selectedDay ? dailyRows.findIndex((row) => row.date === selectedDay) : -1;

  // Calculate weighted rolling indices separately for T1 and T2.
  // Weights: today = 1.0, yesterday = 0.95, -2d = 0.90, ..., -18d = 0.10, -19d = 0.05, -20d = 0.025
  const t1IndexData = useMemo(() => buildWeightedIndexData(dailyRows, (row) => row.t1), [dailyRows]);
  const t2IndexData = useMemo(() => buildWeightedIndexData(dailyRows, (row) => row.t2), [dailyRows]);
  const combinedIndexData = useMemo(() => buildWeightedIndexData(dailyRows, (row) => row.t1 * 2 + row.t2), [dailyRows]);
  const t1RegrowthIndexData = useMemo(() => buildRegrowthIndexData(dailyRows, (row) => row.t1), [dailyRows]);
  const t2RegrowthIndexData = useMemo(() => buildRegrowthIndexData(dailyRows, (row) => row.t2), [dailyRows]);
  const t1ReplacementLevel = useMemo(() => getReplacementLevel(t1RegrowthIndexData, t1), [t1RegrowthIndexData, t1]);
  const t2ReplacementLevel = useMemo(() => getReplacementLevel(t2RegrowthIndexData, t2), [t2RegrowthIndexData, t2]);

  // Re-read the device timezone as well as the local day boundary.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = currentTrackingDate();
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

  // Reload when the local tracking day changes.
  useEffect(() => {
    if (!userId) return;
    loadDailyAndToday(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today]);

  async function fetchAllEvents(uid: string) {
    const pageSize = 1000;
    let from = 0;

    const all: PullEvent[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("trich_events")
        .select("occurred_on, trich, submitted_at, local_time")
        .eq("user_id", uid)
        .order("occurred_on", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const rows = data ?? [];
      all.push(...rows);

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return all;
  }

  async function loadDailyAndToday(uid: string) {
    setErr(null);
    setStatus("loading");

    try {
      const events = await fetchAllEvents(uid);

      // Preserve each event's saved tracking day, including legacy events.
      const byDay = new Map<string, DailyRow>();
      for (const e of events) {
        const day = e.occurred_on;
        const cur = byDay.get(day) ?? { date: day, t1: 0, t2: 0, hourly: Array<number>(24).fill(0) };
        if (Number(e.trich) === 1) cur.t1 += 1;
        else if (Number(e.trich) === 2) cur.t2 += 1;
        else continue;
        const hour = pullHour(e);
        if (hour !== null) cur.hourly[hour] += 1;
        byDay.set(day, cur);
      }

      // Find the earliest date with data
      const allDates = Array.from(byDay.keys()).sort();
      const startDateISO = allDates.length > 0 ? allDates[0] : today;

      // Include saved dates ahead of the current local day after westward travel.
      const out: DailyRow[] = [];
      const start = dateFromISO(startDateISO);
      const latestDateISO = allDates.length > 0 && allDates[allDates.length - 1] > today ? allDates[allDates.length - 1] : today;
      let d = dateFromISO(latestDateISO);

      for (; d >= start; d = new Date(d.getTime() - 86400000)) {
        const iso = d.toISOString().slice(0, 10);
        out.push(byDay.get(iso) ?? { date: iso, t1: 0, t2: 0, hourly: [] });
      }

      setDailyRows(out);

      const todayAgg = byDay.get(today) ?? { t1: 0, t2: 0 };
      setT1(todayAgg.t1);
      setT2(todayAgg.t2);

      setStatus("idle");
    } catch (error: unknown) {
      setErr(getErrorMessage(error, "Failed to load data."));
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
    const timestampCandidates = ["submitted_at", "created_at", "inserted_at", "timestamp", "ts"];

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
      const msg = error.message ?? "";
      if (msg && !msg.toLowerCase().includes("does not exist")) break;
    }

    const all: Array<{ occurred_on: string; trich: number; ts?: string | null; local_date: string | null; local_time: string | null; time_zone: string | null }> = [];

    while (true) {
      const sel = `occurred_on,trich,local_date,local_time,time_zone${tsCol ? `,${tsCol}` : ""}`;
      const { data, error } = await runPage(sel);
      if (error) throw error;

      const rawRows: unknown[] = Array.isArray(data) ? data : [];
      const rows = rawRows.filter(isExportQueryRow);
      for (const r of rows) {
        const timestampValue = tsCol ? r[tsCol] : null;
        all.push({
          occurred_on: r.occurred_on,
          trich: Number(r.trich),
          ts: typeof timestampValue === "string" ? timestampValue : null,
          local_date: typeof r.local_date === "string" ? r.local_date : null,
          local_time: typeof r.local_time === "string" ? r.local_time : null,
          time_zone: typeof r.time_zone === "string" ? r.time_zone : null,
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
        "local_date",
        "local_time",
        "time_zone",
      ];

      const lines: string[] = [];
      lines.push(header.join(","));

      for (const r of rows) {
        const timestamp = r.ts ?? "";
        lines.push([
          csvEscape(r.occurred_on),
          csvEscape(r.trich),
          csvEscape(timestamp),
          csvEscape(r.local_date ?? ""),
          csvEscape(r.local_time ?? ""),
          csvEscape(r.time_zone ?? ""),
        ].join(","));
      }

      // Helpful comment at top if we couldn't find a timestamp column
      const csvBody = lines.join("\n");
      const prefix = tsCol ? "" : "# NOTE: No timestamp column found on trich_events; exported occurred_on + trich only.\n";

      const filename = `trich-events-${today}.csv`;
      downloadTextFile(filename, prefix + csvBody);
    } catch (error: unknown) {
      setExportErr(getErrorMessage(error, "Export failed."));
    } finally {
      setExporting(false);
    }
  }

  async function log(n: 1 | 2) {
    if (!userId) return;

    setErr(null);
    setStatus("saving");

    const fields = trichLogFields();
    const occurredOn = fields.occurred_on;

    // optimistic bump only if it’s for the currently displayed "today"
    if (occurredOn === today) {
      if (n === 1) setT1((x) => x + 1);
      if (n === 2) setT2((x) => x + 1);
    }

    const { error } = await supabase.from("trich_events").insert({
      user_id: userId,
      trich: n,
      ...fields,
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
        <header className="mb-8 grid grid-cols-[72px_1fr_72px] items-start">
          <Link
            href="/"
            className="h-9 w-[60px] rounded-xl border border-white/10 bg-white/5 grid place-items-center text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 active:scale-[0.97] transition"
          >
            Home
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Trich Tracker</h1>
            <div className="mt-2 text-xs text-white/50">
              {isoToMDY(today)}
            </div>
          </div>
          <div aria-hidden="true" />
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
                  <tr
                    key={r.date}
                    onClick={() => setSelectedDay(r.date)}
                    className={`cursor-pointer border-t border-white/5 hover:bg-white/10 ${isZeroDay ? "bg-emerald-500/20" : ""}`}
                  >
                    <td className={`text-left ${isZeroDay ? "text-emerald-300" : "text-white/80"}`}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedDay(r.date); }} className="w-full px-3 py-2 text-left underline decoration-white/20 underline-offset-4" aria-label={`View hourly pulls for ${isoToMDY(r.date)}`}>
                        {isoToMDY(r.date)}
                      </button>
                    </td>
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

          <button
            type="button"
            aria-haspopup="dialog"
            disabled={!userId || status === "saving" || status === "loading"}
            onClick={() => { setOfflineEntryNotice(""); setOfflineEntryOpen(true); }}
            className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            Offline Entry
          </button>
          {offlineEntryNotice && <p role="status" className="mt-3 text-center text-sm text-white/70">{offlineEntryNotice}</p>}
          {exportErr && <div className="mt-3 text-center text-sm text-red-300">{exportErr}</div>}
        </section>

        {/* Weighted Index Charts */}
        {t1IndexData.length >= 2 && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-white/60">21-Day Weighted Index: T1</div>
              <div className="text-right text-xs text-white/50">
                <div>Current: {t1IndexData[t1IndexData.length - 1].index.toFixed(1)}</div>
                <div>Max: {getIndexMax(t1IndexData).toFixed(1)}</div>
              </div>
            </div>
            <TrichIndexChart data={t1IndexData} />
          </section>
        )}

        {t2IndexData.length >= 2 && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-white/60">21-Day Weighted Index: T2</div>
              <div className="text-right text-xs text-white/50">
                <div>Current: {t2IndexData[t2IndexData.length - 1].index.toFixed(1)}</div>
                <div>Max: {getIndexMax(t2IndexData).toFixed(1)}</div>
              </div>
            </div>
            <TrichIndexChart data={t2IndexData} />
          </section>
        )}

        {combinedIndexData.length >= 2 && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-white/60">21-Day Weighted Index: Combined</div>
              <div className="text-right text-xs text-white/50">
                <div>Current: {combinedIndexData[combinedIndexData.length - 1].index.toFixed(1)}</div>
                <div>Max: {getIndexMax(combinedIndexData).toFixed(1)}</div>
              </div>
            </div>
            <TrichIndexChart data={combinedIndexData} />
          </section>
        )}

        {t1RegrowthIndexData.length >= 2 && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-white/60">
                <div>Regrowth Index: T1</div>
                <div className="mt-1 text-white/50">Replacement Level: {t1ReplacementLevel ?? "—"}</div>
              </div>
              <div className="text-right text-xs text-white/50">
                <div>Current: {t1RegrowthIndexData[t1RegrowthIndexData.length - 1].index.toFixed(1)}</div>
                <div>Max: {getIndexMax(t1RegrowthIndexData).toFixed(1)}</div>
              </div>
            </div>
            <TrichIndexChart data={t1RegrowthIndexData} />
          </section>
        )}

        {t2RegrowthIndexData.length >= 2 && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-white/60">
                <div>Regrowth Index: T2</div>
                <div className="mt-1 text-white/50">Replacement Level: {t2ReplacementLevel ?? "—"}</div>
              </div>
              <div className="text-right text-xs text-white/50">
                <div>Current: {t2RegrowthIndexData[t2RegrowthIndexData.length - 1].index.toFixed(1)}</div>
                <div>Max: {getIndexMax(t2RegrowthIndexData).toFixed(1)}</div>
              </div>
            </div>
            <TrichIndexChart data={t2RegrowthIndexData} />
          </section>
        )}
        {dailyRows.length > 0 && (
          <>
            <PullDistributionChart rows={dailyRows} today={today} groupBy="weekday" />
            <PullDistributionChart rows={dailyRows} today={today} groupBy="hour" />
          </>
        )}
      </div>
      {offlineEntryOpen && userId && (
        <OfflineEntryDialog
          userId={userId}
          today={today}
          onClose={() => setOfflineEntryOpen(false)}
          onSaved={(count, type, date) => {
            setOfflineEntryNotice(`Added ${count} ${type} ${count === 1 ? "pull" : "pulls"} to ${isoToMDY(date)}.`);
            void loadDailyAndToday(userId);
          }}
        />
      )}
      {selectedDay && userId && (
        <HourlyPullsDialog
          date={selectedDay}
          userId={userId}
          olderDay={selectedDayIndex >= 0 ? dailyRows[selectedDayIndex + 1]?.date : undefined}
          newerDay={selectedDayIndex > 0 ? dailyRows[selectedDayIndex - 1]?.date : undefined}
          onNavigate={setSelectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </main>
  );
}

function PullDistributionChart({ rows, today, groupBy }: { rows: DailyRow[]; today: string; groupBy: "weekday" | "hour" }) {
  const [range, setRange] = useState("30");
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const byHour = groupBy === "hour";
  const title = byHour ? "Pulls per hour" : "Pulls per day of the week";
  const counts = useMemo(() => {
    const counts = Array<number>(byHour ? 24 : 7).fill(0);
    const start = dateFromISO(today);
    const firstDay = range === "all" ? null : new Date(start.setUTCDate(start.getUTCDate() - Number(range) + 1)).toISOString().slice(0, 10);
    for (const row of rows) {
      if (firstDay && (row.date < firstDay || row.date > today)) continue;
      if (byHour) {
        TRACKING_HOURS.forEach((hour, i) => { counts[i] += row.hourly[hour] ?? 0; });
      } else {
        const weekday = (dateFromISO(row.date).getUTCDay() + 6) % 7;
        counts[weekday] += row.t1 + row.t2;
      }
    }
    return counts;
  }, [byHour, range, rows, today]);
  const max = Math.max(1, ...counts);
  const label = (i: number) => byHour
    ? `${hourLabel(TRACKING_HOURS[i])}–${hourLabel((TRACKING_HOURS[i] + 1) % 24)}`
    : WEEKDAYS[i];

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <select
          aria-label={`Date range for ${title.toLowerCase()}`}
          value={range}
          onChange={(event) => { setRange(event.target.value); setActiveBar(null); }}
          className="min-h-10 rounded-lg border border-white/15 bg-zinc-900 px-2 text-sm text-white"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All</option>
        </select>
      </div>
      <p className="my-2 text-right text-xs tabular-nums text-white/70">
        {activeBar === null ? `Total: ${counts.reduce((sum, count) => sum + count, 0)}` : `${label(activeBar)}: ${counts[activeBar]}`}
      </p>
      <div
        className="grid gap-0.5 rounded-xl border border-white/10 bg-black/30 px-2 pb-2 pt-3"
        style={{ gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))` }}
        onMouseLeave={() => setActiveBar(null)}
      >
        {counts.map((count, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${label(i)}: ${count} pulls`}
            onMouseEnter={() => setActiveBar(i)}
            onFocus={() => setActiveBar(i)}
            onClick={() => setActiveBar(i)}
            className="min-w-0 rounded focus-visible:outline-2 focus-visible:outline-orange-200"
          >
            <span className="flex h-32 items-end justify-center border-b border-white/15">
              <span
                className={`w-4/5 rounded-t-sm ${activeBar === i ? "bg-orange-300" : "bg-orange-500/80"}`}
                style={{ height: `${count / max * 100}%`, minHeight: count > 0 ? 2 : 0 }}
              />
            </span>
            <span aria-hidden="true" className="mt-1 block h-4 whitespace-nowrap text-left text-[10px] text-white/60">
              {byHour ? i % 4 === 0 ? hourLabel(TRACKING_HOURS[i]) : "" : WEEKDAYS[i].slice(0, 3)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function OfflineEntryDialog({ userId, today, onClose, onSaved }: {
  userId: string;
  today: string;
  onClose: () => void;
  onSaved: (count: number, type: "T1" | "T2", date: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fieldClass = "mt-1 h-11 w-full min-w-0 rounded-xl border border-white/15 bg-zinc-900 px-3 text-base text-white";
  const maxCount = 1000;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date") ?? "");
    const type = form.get("type");
    const count = Number(form.get("count"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || (type !== "T1" && type !== "T2") ||
      !Number.isInteger(count) || count < 1 || count > maxCount) {
      setError("Choose today or an earlier date, a pull type, and a whole count from 1 to 1,000.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { error: insertError } = await supabase.from("trich_events").insert(
        Array.from({ length: count }, () => ({
          user_id: userId,
          trich: type === "T1" ? 1 : 2,
          occurred_on: date,
          submitted_at: null,
        })),
      );
      if (insertError) throw new Error(insertError.message);
      onSaved(count, type, date);
      dialogRef.current?.close();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save these pulls."));
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="offline-entry-title"
      onClose={onClose}
      onCancel={(event) => { if (saving) event.preventDefault(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-5 text-white shadow-2xl backdrop:bg-black/75 [color-scheme:dark]"
    >
      <h2 id="offline-entry-title" className="text-xl font-semibold">Offline Entry</h2>
      <p className="mt-2 text-sm text-white/60">Add pulls from your notes to a day without assigning a time.</p>
      <form onSubmit={save} className="mt-5 space-y-4">
        <fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm">
            Date
            <input type="date" name="date" defaultValue={today} max={today} required className={fieldClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Pull type
              <select name="type" className={fieldClass}>
                <option value="T1">T1</option>
                <option value="T2">T2</option>
              </select>
            </label>
            <label className="text-sm">
              Count
              <input type="number" name="count" inputMode="numeric" min={1} max={maxCount} step={1} required className={fieldClass} />
            </label>
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">{saving ? "Saving..." : "Add pulls"}</button>
        </div>
      </form>
    </dialog>
  );
}

function HourlyPullsDialog({ date, userId, olderDay, newerDay, onNavigate, onClose }: {
  date: string;
  userId: string;
  olderDay?: string;
  newerDay?: string;
  onNavigate: (date: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" || !event.isPrimary) return;
        const target = event.target;
        swipeStart.current = target instanceof Element && target.closest("button, [data-hourly-bars]")
          ? null
          : { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerCancel={(event) => {
        if (swipeStart.current?.id === event.pointerId) swipeStart.current = null;
      }}
      onPointerUp={(event) => {
        const start = swipeStart.current;
        if (!start || start.id !== event.pointerId) return;
        swipeStart.current = null;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const nextDay = dx < 0 ? newerDay : olderDay;
        if (nextDay) onNavigate(nextDay);
      }}
      aria-labelledby="hourly-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl touch-pan-y overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 text-white shadow-2xl backdrop:bg-black/75"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="hourly-title" aria-live="polite" className="text-xl font-semibold">
              {new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: EASTERN_TZ }).format(dateFromISO(date))}
              <span className="mt-1 block text-base font-normal text-white/60">{isoToMDY(date)}</span>
            </h2>
            <p className="mt-1 text-sm text-white/50">Hourly pulls · 3am to 3am local time</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm hover:bg-white/10">Close</button>
        </div>
        <div role="group" aria-label="Browse days" className="mt-4 flex justify-between gap-2">
          <button type="button" aria-label="Older day" disabled={!olderDay} onClick={() => olderDay && onNavigate(olderDay)} className="size-11 rounded-xl border border-white/15 text-lg hover:enabled:bg-white/10 disabled:opacity-35"><span aria-hidden="true">&larr;</span></button>
          <button type="button" aria-label="Newer day" disabled={!newerDay} onClick={() => newerDay && onNavigate(newerDay)} className="size-11 rounded-xl border border-white/15 text-lg hover:enabled:bg-white/10 disabled:opacity-35"><span aria-hidden="true">&rarr;</span></button>
        </div>
        <HourlyPullsChart key={date} date={date} userId={userId} />
      </div>
    </dialog>
  );
}

function HourlyPullsChart({ date, userId }: { date: string; userId: string }) {
  const [counts, setCounts] = useState<number[] | null>(null);
  const [hasUntimedPulls, setHasUntimedPulls] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeHour, setActiveHour] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const nextDate = new Date(dateFromISO(date).getTime() + 86400000).toISOString().slice(0, 10);
        const start = easternDayStart(date);
        const end = easternDayStart(nextDate);
        const hourly = Array<number>(24).fill(0);
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error: queryError } = await supabase.from("trich_events")
            .select("id, submitted_at, local_time, time_zone")
            .eq("user_id", userId)
            .in("trich", [1, 2])
            .or(`and(time_zone.not.is.null,occurred_on.eq.${date}),and(time_zone.is.null,submitted_at.gte.${start},submitted_at.lt.${end})`)
            .order("submitted_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
          if (queryError) throw new Error(queryError.message);
          if (cancelled) return;
          for (const event of data ?? []) {
            const hour = pullHour(event);
            if (hour !== null) hourly[(hour + 24 - TRICH_DAY_START_HOUR) % 24] += 1;
          }
          if ((data?.length ?? 0) < pageSize) break;
        }
        if (!cancelled) setCounts(hourly);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, "Unable to load hourly pulls."));
      }
    }
    void load();

    async function checkForUntimedPulls() {
      const { data } = await supabase.from("trich_events")
        .select("id")
        .eq("user_id", userId)
        .eq("occurred_on", date)
        .in("trich", [1, 2])
        .is("submitted_at", null)
        .limit(1);
      if (!cancelled) setHasUntimedPulls(Boolean(data?.length));
    }
    void checkForUntimedPulls();

    return () => { cancelled = true; };
  }, [date, userId]);

  const max = Math.max(1, ...(counts ?? []));
  const total = counts?.reduce((sum, count) => sum + count, 0) ?? 0;
  const selected = activeHour ?? 0;
  const startHour = (selected + 3) % 24;

  return (
    <>
      {error ? <p role="alert" className="mt-6 text-sm text-red-300">{error}</p> : !counts ? <p role="status" className="grid h-[21rem] place-items-center text-white/50">Loading hourly pulls...</p> : (
        <>
          <div className="mb-5 mt-6 flex items-center justify-between gap-2 text-sm tabular-nums">
            <span className="text-white/60">Total: <strong className="text-white">{total}</strong></span>
            <span aria-live="polite">{hourLabel(startHour)}–{hourLabel((startHour + 1) % 24)}: <strong className="text-orange-300">{counts[selected]}</strong></span>
          </div>
          <div className="relative pl-7">
            <span className="absolute left-0 top-0 text-xs text-white/40">{max}</span>
            <span className="absolute bottom-0 left-0 text-xs text-white/40">0</span>
            <div data-hourly-bars className="grid h-56 touch-none grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-[2px] border-b border-white/20 bg-[linear-gradient(to_top,transparent_49.5%,rgba(255,255,255,0.06)_50%,transparent_50.5%)]"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                const rect = event.currentTarget.getBoundingClientRect();
                setActiveHour(Math.max(0, Math.min(23, Math.floor((event.clientX - rect.left) / rect.width * 24))));
              }}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setActiveHour(Math.max(0, Math.min(23, Math.floor((event.clientX - rect.left) / rect.width * 24))));
              }}>
              {counts.map((count, index) => {
                const hour = (index + 3) % 24;
                return <button key={index} type="button" aria-label={`${hourLabel(hour)} to ${hourLabel((hour + 1) % 24)} Eastern: ${count} pulls`} onFocus={() => setActiveHour(index)} onClick={() => setActiveHour(index)} className="group relative h-full min-w-0 rounded-t-sm focus-visible:outline-2 focus-visible:outline-orange-200">
                  <span className={`absolute inset-x-0 bottom-0 rounded-t-sm ${selected === index ? "bg-orange-300" : "bg-orange-500/80"}`} style={{ height: `${count / max * 100}%`, minHeight: count ? 2 : 0 }} />
                </button>;
              })}
            </div>
            <div className="mt-2 grid grid-cols-8 text-[10px] text-white/45">
              {Array.from({ length: 8 }, (_, i) => <span key={i}>{hourLabel((3 + i * 3) % 24)}</span>)}
            </div>
          </div>
          {hasUntimedPulls && (
            <p className="mt-5 text-center text-xs text-white/40">Offline entries only appear in daily totals and indexes.</p>
          )}
        </>
      )}
    </>
  );
}

function TrichIndexChart({ data }: { data: IndexPoint[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const indices = data.map((d) => d.index);
  const maxIdx = Math.max(...indices);
  const yMin = 0;
  const yMax = Math.max(1, maxIdx * 1.1);

  const n = data.length;

  const fmt = (iso: string) => {
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    return `${m}/${d}`;
  };

  const firstDate = data[0]?.date ?? "";
  const lastDate = data[data.length - 1]?.date ?? "";
  const activePoint = activeIndex == null ? null : data[activeIndex];

  const getPointX = (index: number) => 8 + (index / (n - 1)) * 89;
  const getPointY = (index: number) => 92 - ((data[index].index - yMin) / (yMax - yMin)) * 84;

  const updateActiveIndex = (clientX: number) => {
    const el = chartRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const relativeX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const ratio = rect.width > 0 ? relativeX / rect.width : 0;
    const nextIndex = Math.round(ratio * (n - 1));
    setActiveIndex(Math.min(n - 1, Math.max(0, nextIndex)));
  };

  return (
    <div
      ref={chartRef}
      className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 relative h-[200px] touch-none"
      onMouseMove={(event) => updateActiveIndex(event.clientX)}
      onMouseLeave={() => setActiveIndex(null)}
      onTouchStart={(event) => updateActiveIndex(event.touches[0].clientX)}
      onTouchMove={(event) => updateActiveIndex(event.touches[0].clientX)}
      onTouchEnd={() => setActiveIndex(null)}
    >
      {/* Y axis labels - HTML positioned */}
      <div className="absolute left-1 top-1 text-[9px] text-white/50">{Math.round(yMax)}</div>
      <div className="absolute left-1 bottom-5 text-[9px] text-white/50">{Math.round(yMin)}</div>

      {/* X axis labels - HTML positioned */}
      <div className="absolute left-7 bottom-1 text-[9px] text-white/45">{fmt(firstDate)}</div>
      <div className="absolute right-2 bottom-1 text-[9px] text-white/45">{fmt(lastDate)}</div>
      {activePoint && (
        <div className="absolute right-2 top-2 rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[10px] text-white/85">
          {isoToMDY(activePoint.date)} · {activePoint.index.toFixed(1)}
        </div>
      )}

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
              const xPct = getPointX(i);
              const yPct = getPointY(i);
              return `${xPct},${yPct}`;
            })
            .join(" ")}
        />

        {activeIndex != null && (
          <>
            <line
              x1={getPointX(activeIndex)}
              y1="8"
              x2={getPointX(activeIndex)}
              y2="92"
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="1.5 1.5"
              strokeWidth="0.4"
            />
            <circle
              cx={getPointX(activeIndex)}
              cy={getPointY(activeIndex)}
              r="1.2"
              fill="rgba(251,146,60,1)"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="0.25"
            />
          </>
        )}

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
