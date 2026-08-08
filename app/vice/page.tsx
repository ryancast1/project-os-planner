"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const APP_TIME_ZONE = "America/New_York";
const PAGE_SIZE = 1000;
const ML_PER_OUNCE = 29.5735;

type AmountUnit = "oz" | "mL";

type WeedHit = { id: string; created_at: string; occurred_on: string; occurred_at: string };
type AlcoholEntry = {
  id: string;
  created_at: string;
  occurred_on: string;
  occurred_at: string;
  amount_oz: number;
  abv: number;
  label: string | null;
  standard_drinks: number;
};
type DailyValue = { date: string; value: number };

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function chartDatesFor(datesWithData: string[]) {
  if (datesWithData.length === 0) return [dateKey(new Date())];

  const keys = [...datesWithData].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  const dates: string[] = [];
  const cursor = new Date(`${first}T12:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function DailyBarChart({ data, color, unit }: { data: DailyValue[]; color: string; unit: string }) {
  const width = 640;
  const height = 230;
  const left = 34;
  const right = 10;
  const top = 22;
  const bottom = 42;
  const max = Math.max(1, ...data.map((item) => item.value));
  const plotWidth = width - left - right;
  const slotWidth = plotWidth / data.length;
  const barWidth = Math.max(1, Math.min(28, slotWidth * 0.62));
  const plotHeight = height - top - bottom;
  const ticks = [max, max / 2, 0];

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={`${unit} by day from ${shortDate(data[0].date)} through ${shortDate(data[data.length - 1].date)}`}>
        {ticks.map((tick, index) => {
          const y = top + (1 - tick / max) * plotHeight;
          return (
            <g key={index}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#262626" />
              <text x={left - 7} y={y + 4} textAnchor="end" fill="#737373" fontSize="11">
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const barHeight = (item.value / max) * plotHeight;
          const x = left + index * slotWidth + (slotWidth - barWidth) / 2;
          const y = top + plotHeight - barHeight;
          const showLabel = index === 0 || index === data.length - 1 || index === Math.floor(data.length / 2);
          return (
            <g key={item.date}>
              <title>{`${shortDate(item.date)}: ${item.value.toFixed(unit === "hits" ? 0 : 2)} ${unit}`}</title>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="3" fill={color} />
              {showLabel ? <text x={x + barWidth / 2} y={height - 17} textAnchor="middle" fill="#a3a3a3" fontSize="11">{shortDate(item.date)}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function VicePage() {
  const [weedHits, setWeedHits] = useState<WeedHit[]>([]);
  const [alcoholEntries, setAlcoholEntries] = useState<AlcoholEntry[]>([]);
  const [amountOz, setAmountOz] = useState("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("oz");
  const [abv, setAbv] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [weedSaving, setWeedSaving] = useState(false);
  const [alcoholSaving, setAlcoholSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allWeedHits, allAlcoholEntries] = await Promise.all([
        (async () => {
          const rows: WeedHit[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error: queryError } = await supabase.from("weed_hits").select("id,created_at,occurred_on,occurred_at").order("occurred_on", { ascending: false }).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
            if (queryError) throw queryError;
            const page = (data ?? []) as WeedHit[];
            rows.push(...page);
            if (page.length < PAGE_SIZE) break;
          }
          return rows;
        })(),
        (async () => {
          const rows: AlcoholEntry[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error: queryError } = await supabase.from("alcohol_entries").select("id,created_at,occurred_on,occurred_at,amount_oz,abv,label,standard_drinks").order("occurred_on", { ascending: false }).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
            if (queryError) throw queryError;
            const page = (data ?? []) as AlcoholEntry[];
            rows.push(...page);
            if (page.length < PAGE_SIZE) break;
          }
          return rows;
        })(),
      ]);
      setWeedHits(allWeedHits);
      setAlcoholEntries(allAlcoholEntries);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load vice data.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(() => setConfirmation(null), 1600);
    return () => window.clearTimeout(timer);
  }, [confirmation]);

  const recentDrinks = useMemo(() => {
    const seen = new Set<string>();
    const result: AlcoholEntry[] = [];
    for (const entry of alcoholEntries) {
      const drinkLabel = entry.label?.trim();
      if (!drinkLabel || seen.has(drinkLabel)) continue;
      seen.add(drinkLabel);
      result.push(entry);
      if (result.length === 5) break;
    }
    return result;
  }, [alcoholEntries]);

  const weedDates = useMemo(() => chartDatesFor(weedHits.map((hit) => hit.occurred_on)), [weedHits]);
  const alcoholDates = useMemo(() => chartDatesFor(alcoholEntries.map((entry) => entry.occurred_on)), [alcoholEntries]);
  const weedChart = useMemo(() => {
    const totals = new Map(weedDates.map((date) => [date, 0]));
    weedHits.forEach((hit) => {
      const day = hit.occurred_on;
      if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + 1);
    });
    return weedDates.map((date) => ({ date, value: totals.get(date) ?? 0 }));
  }, [weedDates, weedHits]);
  const alcoholChart = useMemo(() => {
    const totals = new Map(alcoholDates.map((date) => [date, 0]));
    alcoholEntries.forEach((entry) => {
      const day = entry.occurred_on;
      if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + Number(entry.standard_drinks));
    });
    return alcoholDates.map((date) => ({ date, value: totals.get(date) ?? 0 }));
  }, [alcoholDates, alcoholEntries]);

  const today = dateKey(new Date());
  const todayWeedHits = weedHits.filter((hit) => hit.occurred_on === today).length;
  const todayStandardDrinks = alcoholEntries.reduce(
    (total, entry) => entry.occurred_on === today ? total + Number(entry.standard_drinks) : total,
    0
  );

  async function logWeedHit() {
    if (weedSaving) return;
    setWeedSaving(true);
    setError(null);
    const { data, error: saveError } = await supabase.from("weed_hits").insert({}).select("id,created_at,occurred_on,occurred_at").single();
    setWeedSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setWeedHits((current) => [data as WeedHit, ...current]);
    setConfirmation("Weed hit logged");
  }

  async function logAlcohol(event?: FormEvent) {
    event?.preventDefault();
    if (alcoholSaving) return;
    const enteredAmount = Number(amountOz);
    const abvPercent = Number(abv);
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0 || !Number.isFinite(abvPercent) || abvPercent <= 0 || abvPercent > 100) {
      setError("Enter an amount greater than 0 and an ABV from 0 to 100.");
      return;
    }
    const ounces = amountUnit === "mL" ? enteredAmount / ML_PER_OUNCE : enteredAmount;
    const storedOunces = Math.round(ounces * 100) / 100;
    const standardDrinks = storedOunces * (abvPercent / 100) / 0.6;
    setAlcoholSaving(true);
    setError(null);
    const { data, error: saveError } = await supabase
      .from("alcohol_entries")
      .insert({ amount_oz: storedOunces, abv: abvPercent, label: label.trim() || null, standard_drinks: standardDrinks })
      .select("id,created_at,occurred_on,occurred_at,amount_oz,abv,label,standard_drinks")
      .single();
    setAlcoholSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setAlcoholEntries((current) => [data as AlcoholEntry, ...current]);
    setAmountOz("");
    setAbv("");
    setLabel("");
    setConfirmation(`${standardDrinks.toFixed(2)} standard drinks logged`);
  }

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header>
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">← Home</Link>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div>
            <button type="submit" form="alcohol-form" disabled={alcoholSaving} className="h-28 w-full rounded-3xl bg-white text-5xl font-bold text-neutral-950 shadow-sm transition active:scale-[0.98] disabled:opacity-60" aria-label="Log alcohol entry">
              {alcoholSaving ? "…" : "A"}
            </button>
            <div className="mt-2 text-center text-sm text-neutral-400"><span className="font-semibold tabular-nums text-neutral-100">{todayStandardDrinks.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> standard drinks today</div>
          </div>
          <div>
            <button type="button" onClick={logWeedHit} disabled={weedSaving} className="h-28 w-full rounded-3xl bg-white text-5xl font-bold text-neutral-950 shadow-sm transition active:scale-[0.98] disabled:opacity-60" aria-label="Log one weed hit">
              {weedSaving ? "…" : "W"}
            </button>
            <div className="mt-2 text-center text-sm text-neutral-400"><span className="font-semibold tabular-nums text-neutral-100">{todayWeedHits}</span> hits today</div>
          </div>
        </div>

        <div className="mt-3 min-h-6 text-center text-sm text-neutral-400" aria-live="polite">{confirmation}</div>
        {error ? <div className="mt-2 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <form id="alcohol-form" onSubmit={logAlcohol} className="mt-4 rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-neutral-400">Amount
              <div className="mt-1.5 flex">
                <input required type="number" inputMode="decimal" min="0.01" step="0.01" value={amountOz} onChange={(event) => setAmountOz(event.target.value)} className="block min-w-0 flex-1 rounded-l-xl border border-r-0 border-neutral-700 bg-black/40 px-3 py-3 text-base text-neutral-100 outline-none focus:border-neutral-400" />
                <select value={amountUnit} onChange={(event) => setAmountUnit(event.target.value as AmountUnit)} aria-label="Amount unit" className="rounded-r-xl border border-neutral-700 bg-neutral-900 px-2 text-sm font-semibold text-neutral-100 outline-none focus:border-neutral-400">
                  <option value="oz">oz</option>
                  <option value="mL">mL</option>
                </select>
              </div>
            </label>
            <label className="text-xs font-semibold text-neutral-400">ABV (%)
              <input required type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={abv} onChange={(event) => setAbv(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-neutral-700 bg-black/40 px-3 py-3 text-base text-neutral-100 outline-none focus:border-neutral-400" />
            </label>
          </div>
          <label className="mt-3 block text-xs font-semibold text-neutral-400">Label <span className="font-normal text-neutral-600">(optional)</span>
            <input type="text" maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-neutral-700 bg-black/40 px-3 py-3 text-base text-neutral-100 outline-none focus:border-neutral-400" />
          </label>
          {recentDrinks.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-neutral-500">Recent drinks</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recentDrinks.map((drink) => <button key={drink.label} type="button" onClick={() => { setLabel(drink.label ?? ""); setAmountOz(String(Number(drink.amount_oz))); setAmountUnit("oz"); setAbv(String(Number(drink.abv))); }} className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 active:scale-[0.98]">{drink.label}</button>)}
              </div>
            </div>
          ) : null}
        </form>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/30 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Standard drinks per day</h2>
            <div className="mt-4">{loading ? <div className="py-20 text-center text-sm text-neutral-500">Loading…</div> : <DailyBarChart data={alcoholChart} color="#34d399" unit="drinks" />}</div>
          </section>
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/30 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Weed hits per day</h2>
            <div className="mt-4">{loading ? <div className="py-20 text-center text-sm text-neutral-500">Loading…</div> : <DailyBarChart data={weedChart} color="#34d399" unit="hits" />}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
