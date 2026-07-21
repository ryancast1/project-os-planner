"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DistanceUnit = "km" | "mi";

type Run = {
  id: string;
  user_id: string;
  run_date: string;
  duration_seconds: number;
  distance: number;
  distance_unit: DistanceUnit;
  temperature_f: number | null;
  notes: string;
  is_east_river_3k: boolean;
  created_at: string;
  updated_at: string;
};

function todayISODate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function BenchmarkChart({ runs }: { runs: Run[] }) {
  const points = useMemo(
    () => [...runs].sort((a, b) => a.run_date.localeCompare(b.run_date)),
    [runs]
  );

  if (points.length === 0) {
    return <div className="py-16 text-center text-sm text-neutral-500">Log an East River 3K to start the chart.</div>;
  }

  const width = 720;
  const height = 280;
  const left = 58;
  const right = 20;
  const top = 24;
  const bottom = 48;
  const values = points.map((run) => run.duration_seconds);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(30, Math.round((rawMax - rawMin) * 0.15));
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const range = Math.max(1, max - min);
  const x = (index: number) =>
    points.length === 1 ? (left + width - right) / 2 : left + (index / (points.length - 1)) * (width - left - right);
  const y = (seconds: number) => top + ((max - seconds) / range) * (height - top - bottom);
  const path = points.map((run, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(run.duration_seconds)}`).join(" ");
  const ticks = [max, Math.round((max + min) / 2), min];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img" aria-label="East River 3K times over time">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="#262626" strokeWidth="1" />
            <text x={left - 10} y={y(tick) + 4} textAnchor="end" fill="#737373" fontSize="12">
              {formatDuration(tick)}
            </text>
          </g>
        ))}
        {points.length > 1 ? <path d={path} fill="none" stroke="#34d399" strokeWidth="3" strokeLinejoin="round" /> : null}
        {points.map((run, index) => (
          <g key={run.id}>
            <circle cx={x(index)} cy={y(run.duration_seconds)} r="5" fill="#34d399" />
            <text x={x(index)} y={height - 18} textAnchor="middle" fill="#a3a3a3" fontSize="11">
              {new Date(`${run.run_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function RunningPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBenchmarkOnly, setShowBenchmarkOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [runDate, setRunDate] = useState(todayISODate());
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [distance, setDistance] = useState("");
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km");
  const [temperature, setTemperature] = useState("");
  const [notes, setNotes] = useState("");
  const [isBenchmark, setIsBenchmark] = useState(false);

  async function loadRuns() {
    setError(null);
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("running_runs")
      .select("id,user_id,run_date,duration_seconds,distance,distance_unit,temperature_f,notes,is_east_river_3k,created_at,updated_at")
      .order("run_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      setRuns([]);
    } else {
      setRuns((data ?? []) as Run[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleRuns = useMemo(
    () => (showBenchmarkOnly ? runs.filter((run) => run.is_east_river_3k) : runs),
    [runs, showBenchmarkOnly]
  );
  const benchmarkRuns = useMemo(() => runs.filter((run) => run.is_east_river_3k), [runs]);

  function setBenchmark(checked: boolean) {
    setIsBenchmark(checked);
    if (checked) {
      setDistance("2.9");
      setDistanceUnit("km");
    }
  }

  function resetForm() {
    setRunDate(todayISODate());
    setMinutes("");
    setSeconds("");
    setDistance("");
    setDistanceUnit("km");
    setTemperature("");
    setNotes("");
    setIsBenchmark(false);
  }

  async function saveRun(event: FormEvent) {
    event.preventDefault();
    const minuteValue = Number(minutes || 0);
    const secondValue = Number(seconds || 0);
    const distanceValue = Number(distance);
    const temperatureValue = temperature.trim() === "" ? null : Number(temperature);

    if (!runDate || !Number.isInteger(minuteValue) || minuteValue < 0 || !Number.isInteger(secondValue) || secondValue < 0 || secondValue > 59) {
      setError("Enter a valid date and time. Seconds must be from 0 to 59.");
      return;
    }
    if (minuteValue * 60 + secondValue <= 0 || !Number.isFinite(distanceValue) || distanceValue <= 0) {
      setError("Time and distance must both be greater than zero.");
      return;
    }
    if (temperatureValue !== null && !Number.isInteger(temperatureValue)) {
      setError("Temperature must be a whole number.");
      return;
    }

    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from("running_runs").insert({
      run_date: runDate,
      duration_seconds: minuteValue * 60 + secondValue,
      distance: distanceValue,
      distance_unit: distanceUnit,
      temperature_f: temperatureValue,
      notes: notes.trim(),
      is_east_river_3k: isBenchmark,
    });
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    resetForm();
    setShowForm(false);
    await loadRuns();
  }

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">← Home</Link>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Running</h1>
          </div>
          <button onClick={() => { setError(null); setShowForm(true); }} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 active:scale-[0.98]">
            Log Run
          </button>
        </header>

        <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-950/50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Runs logged</div>
          <div className="mt-1 text-6xl font-semibold tabular-nums text-neutral-100">{loading ? "—" : runs.length}</div>
        </section>

        {error ? <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Run history</h2>
            <button
              onClick={() => setShowBenchmarkOnly((value) => !value)}
              aria-pressed={showBenchmarkOnly}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${showBenchmarkOnly ? "border-emerald-400 bg-emerald-400 text-neutral-950" : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
            >
              East River 3K only
            </button>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/30">
            <div className="grid grid-cols-[1.35fr_0.85fr_0.65fr] border-b border-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-500">
              <div>Date</div><div>Distance</div><div className="text-right">Time</div>
            </div>
            {loading ? (
              <div className="px-4 py-5 text-sm text-neutral-500">Loading runs…</div>
            ) : visibleRuns.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">No runs to show.</div>
            ) : visibleRuns.map((run) => {
              const expanded = expandedId === run.id;
              return (
                <div key={run.id} className="border-b border-neutral-900 last:border-0">
                  <button onClick={() => setExpandedId(expanded ? null : run.id)} className="grid w-full grid-cols-[1.35fr_0.85fr_0.65fr] items-center px-4 py-4 text-left hover:bg-neutral-900/60">
                    <div>
                      <div className="text-sm font-semibold text-neutral-200">{formatDate(run.run_date)}</div>
                      {run.is_east_river_3k ? <div className="mt-1 text-[11px] font-semibold text-emerald-400">EAST RIVER 3K</div> : null}
                    </div>
                    <div className="text-sm tabular-nums text-neutral-300">{Number(run.distance)} {run.distance_unit}</div>
                    <div className="text-right text-sm font-semibold tabular-nums text-neutral-100">{formatDuration(run.duration_seconds)}</div>
                  </button>
                  {expanded ? (
                    <div className="grid gap-4 border-t border-neutral-900 bg-black/20 px-4 py-4 sm:grid-cols-[150px_1fr]">
                      <div><div className="text-xs text-neutral-500">Temperature</div><div className="mt-1 text-sm text-neutral-200">{run.temperature_f === null ? "Not logged" : `${run.temperature_f}°F`}</div></div>
                      <div><div className="text-xs text-neutral-500">Notes</div><div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-200">{run.notes || "No notes"}</div></div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-neutral-800 bg-neutral-950/30 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-lg font-semibold">East River 3K</h2>
            <div className="text-xs text-neutral-500">{benchmarkRuns.length} logged</div>
          </div>
          <div className="mt-4"><BenchmarkChart runs={benchmarkRuns} /></div>
        </section>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="log-run-title">
          <form onSubmit={saveRun} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between"><h2 id="log-run-title" className="text-xl font-semibold">Log a Run</h2><button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900">Close</button></div>

            <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
              <input type="checkbox" checked={isBenchmark} onChange={(event) => setBenchmark(event.target.checked)} className="h-5 w-5 accent-emerald-400" />
              <span className="text-sm font-semibold">East River 3K</span>
            </label>

            <div className="mt-4 grid grid-cols-[1.2fr_1fr] gap-3">
              <label className="min-w-0 text-xs font-semibold text-neutral-400">Date<input required type="date" value={runDate} onChange={(event) => setRunDate(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-neutral-700 bg-black/40 px-3 py-2.5 text-base text-neutral-100 outline-none focus:border-emerald-500" /></label>
              <div>
                <div className="text-xs font-semibold text-neutral-400">Distance</div>
                <div className="mt-1.5 flex gap-1.5"><input required inputMode="decimal" type="number" min="0.01" step="0.01" value={distance} onChange={(event) => setDistance(event.target.value)} aria-label="Distance" className="min-w-0 w-full rounded-xl border border-neutral-700 bg-black/40 px-2 py-2.5 text-center text-base outline-none focus:border-emerald-500" /><select value={distanceUnit} onChange={(event) => setDistanceUnit(event.target.value as DistanceUnit)} aria-label="Distance unit" className="w-[54px] shrink-0 rounded-xl border border-neutral-700 bg-neutral-900 px-1 py-2.5 text-sm outline-none focus:border-emerald-500"><option value="km">km</option><option value="mi">mi</option></select></div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-[1.5fr_0.65fr] gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-400">Time</div>
                <div className="mt-1.5 flex gap-1.5">
                  <label className="relative min-w-0 flex-1"><input required inputMode="numeric" type="number" min="0" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} aria-label="Minutes" className="w-full rounded-xl border border-neutral-700 bg-black/40 px-2 py-2.5 pr-7 text-center text-base outline-none focus:border-emerald-500" /><span className="absolute right-2 top-3 text-[10px] text-neutral-500">m</span></label>
                  <label className="relative min-w-0 flex-1"><input required inputMode="numeric" type="number" min="0" max="59" step="1" value={seconds} onChange={(event) => setSeconds(event.target.value)} aria-label="Seconds" className="w-full rounded-xl border border-neutral-700 bg-black/40 px-2 py-2.5 pr-6 text-center text-base outline-none focus:border-emerald-500" /><span className="absolute right-2 top-3 text-[10px] text-neutral-500">s</span></label>
                </div>
              </div>
              <label className="min-w-0 text-xs font-semibold text-neutral-400">Temp °F<input inputMode="numeric" type="number" step="1" value={temperature} onChange={(event) => setTemperature(event.target.value)} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-black/40 px-2 py-2.5 text-center text-base font-normal text-neutral-100 outline-none focus:border-emerald-500" /></label>
            </div>
            <label className="mt-4 block text-xs font-semibold text-neutral-400">Notes<textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1.5 w-full resize-y rounded-xl border border-neutral-700 bg-black/40 px-3 py-3 text-base font-normal leading-6 text-neutral-100 outline-none focus:border-emerald-500" /></label>
            {error ? <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</div> : null}
            <button disabled={saving} className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-50">{saving ? "Saving…" : "Save run"}</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
