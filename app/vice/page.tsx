"use client";

import Link from "next/link";
import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { localTrackingTime, VICE_DAY_START_HOUR, viceLogFields } from "@/lib/localTrackingTime";

const APP_TIME_ZONE = "America/New_York";
const TRACKING_DAY_START_HOUR = VICE_DAY_START_HOUR;
const PAGE_SIZE = 1000;
const ML_PER_OUNCE = 29.5735;
const PRESET_LABEL_PREFIX = "[preset] ";
const PLAIN_LABEL_PREFIX = "[label] ";
const MAX_ALCOHOL_LABEL_LENGTH = 120;

type AmountUnit = "oz" | "mL";

type WeedHit = { id: string; user_id: string; created_at: string; occurred_on: string; occurred_at: string; time_zone: string | null };
type AlcoholEntry = {
  id: string;
  user_id: string;
  created_at: string;
  occurred_on: string;
  occurred_at: string;
  time_zone: string | null;
  amount_oz: number;
  abv: number;
  label: string | null;
  standard_drinks: number;
};
type DailyValue = { date: string; value: number };

function formatDrinks(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function displayAlcoholLabel(label: string | null) {
  const prefix = [PRESET_LABEL_PREFIX, PLAIN_LABEL_PREFIX].find((marker) => label?.startsWith(marker));
  return prefix ? label?.slice(prefix.length) : label;
}

function previousISODate(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function subtractISODays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function trackingDate(occurredOn: string, occurredAt: string) {
  return Number(occurredAt.split(":")[0]) < TRACKING_DAY_START_HOUR ? previousISODate(occurredOn) : occurredOn;
}

function currentTrackingDate() {
  return localTrackingTime(TRACKING_DAY_START_HOUR).trackingDate;
}

function chartDatesFor(datesWithData: string[]) {
  if (datesWithData.length === 0) return [currentTrackingDate()];

  const keys = [...datesWithData].sort();
  const first = keys[0];
  const last = keys[keys.length - 1] > currentTrackingDate() ? keys[keys.length - 1] : currentTrackingDate();
  const dates: string[] = [];
  const cursor = new Date(`${first}T12:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function nycLocalTimeToTimestamp(occurredOn: string, occurredAt: string) {
  const [year, month, day] = occurredOn.split("-").map(Number);
  const [hour, minute, second] = occurredAt.split(":").map(Number);
  const targetAsUTC = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  let guess = targetAsUTC;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const renderedAsUTC = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    guess += targetAsUTC - renderedAsUTC;
  }

  return guess;
}

function lastEntryTimestamp(entries: WeedHit[]) {
  // New logs retain the real instant; legacy entries retain their Eastern interpretation.
  const latestLegacy = entries.find((entry) => !entry.time_zone);
  const legacyTimestamp = latestLegacy
    ? nycLocalTimeToTimestamp(latestLegacy.occurred_on, latestLegacy.occurred_at)
    : -Infinity;
  return entries.reduce((latest, entry) => entry.time_zone
    ? Math.max(latest, Date.parse(entry.created_at))
    : latest, legacyTimestamp);
}

function formatElapsed(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  return parts.join(", ");
}

function downloadCSV(filename: string, rows: Array<Array<string | number | null>>) {
  const csv = rows.map((row) => row.map((value) => {
    const text = value === null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function weekday(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function DailyBarChart({ data, color, unit, averageDays = 7 }: { data: DailyValue[]; color: string; unit: string; averageDays?: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
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
  const rollingAverages = data.slice(averageDays - 1).map((item, offset) => ({
    date: item.date,
    index: offset + averageDays - 1,
    value: data.slice(offset, offset + averageDays).reduce((sum, day) => sum + day.value, 0) / averageDays,
  }));
  const xCenter = (index: number) => left + index * slotWidth + slotWidth / 2;
  const yValue = (value: number) => top + (1 - value / max) * plotHeight;
  const averagePath = rollingAverages
    .map((item, index) => `${index === 0 ? "M" : "L"} ${xCenter(item.index)} ${yValue(item.value)}`)
    .join(" ");
  const averageByIndex = new Map(rollingAverages.map((item) => [item.index, item.value]));
  const activeItem = activeIndex === null ? null : data[activeIndex];
  const activeAverage = activeIndex === null ? undefined : averageByIndex.get(activeIndex);
  const tooltipWidth = 170;
  const tooltipX = activeIndex === null ? 0 : Math.max(left, Math.min(width - right - tooltipWidth, xCenter(activeIndex) - tooltipWidth / 2));
  const tooltipY = top + 8;

  function selectNearestDay(event: React.PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const index = Math.max(0, Math.min(data.length - 1, Math.floor((svgX - left) / slotWidth)));
    setActiveIndex(index);
  }

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={`${unit} by day from ${shortDate(data[0].date)} through ${shortDate(data[data.length - 1].date)}`}>
        {ticks.map((tick, index) => {
          const y = top + (1 - tick / max) * plotHeight;
          return (
            <g key={index}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#262626" />
              <text x={left - 7} y={y + 4} textAnchor="end" fill="#737373" fontSize="11">
                {unit === "drinks" ? formatDrinks(tick) : Number.isInteger(tick) ? tick : tick.toFixed(1)}
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
              <title>{`${shortDate(item.date)}: ${unit === "drinks" ? formatDrinks(item.value) : item.value.toFixed(0)} ${unit}`}</title>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="3" fill={color} />
              {showLabel ? <text x={x + barWidth / 2} y={height - 17} textAnchor="middle" fill="#a3a3a3" fontSize="11">{shortDate(item.date)}</text> : null}
            </g>
          );
        })}
        {rollingAverages.length > 1 ? <path d={averagePath} fill="none" stroke="#f5f5f5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {rollingAverages.map((item) => (
          <circle key={`average-${item.date}`} cx={xCenter(item.index)} cy={yValue(item.value)} r="2.5" fill="#f5f5f5">
            <title>{`${shortDate(item.date)}: ${unit === "drinks" ? formatDrinks(item.value) : item.value.toFixed(2)} ${unit} ${averageDays}-day average`}</title>
          </circle>
        ))}
        {activeItem ? (
          <g pointerEvents="none">
            <line x1={xCenter(activeIndex!)} x2={xCenter(activeIndex!)} y1={top} y2={top + plotHeight} stroke="#d4d4d4" strokeWidth="1" strokeDasharray="3 3" />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={activeAverage === undefined ? 49 : 66} rx="8" fill="#171717" stroke="#525252" />
            <text x={tooltipX + 10} y={tooltipY + 17} fill="#d4d4d4" fontSize="11" fontWeight="600">{shortDate(activeItem.date)}</text>
            <text x={tooltipX + 10} y={tooltipY + 35} fill="#f5f5f5" fontSize="12">{unit === "drinks" ? formatDrinks(activeItem.value) : activeItem.value.toFixed(0)} {unit}</text>
            {activeAverage !== undefined ? <text x={tooltipX + 10} y={tooltipY + 53} fill="#a3a3a3" fontSize="11">{averageDays}-day avg: {unit === "drinks" ? formatDrinks(activeAverage) : activeAverage.toFixed(2)}</text> : null}
          </g>
        ) : null}
        <rect
          x={left}
          y={top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          style={{ touchAction: "pan-y" }}
          onPointerDown={selectNearestDay}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse" || event.buttons > 0) selectNearestDay(event);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setActiveIndex(null);
          }}
        />
      </svg>
      {rollingAverages.length > 0 ? <div className="flex items-center justify-end gap-1.5 pr-1 text-[11px] text-neutral-500"><span className="block h-0.5 w-5 bg-neutral-100" />{averageDays}-day avg</div> : null}
    </div>
  );
}

type DayDialogProps = {
  date: string;
  days: { date: string }[];
  onNavigate: (date: string) => void;
  onClose: () => void;
};

function ViceDayDialog({ date, days, onNavigate, onClose, kind, children }: DayDialogProps & {
  kind: "Alcohol" | "Weed";
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const dayIndex = days.findIndex((day) => day.date === date);
  const olderDay = dayIndex >= 0 ? days[dayIndex + 1]?.date : undefined;
  const newerDay = dayIndex > 0 ? days[dayIndex - 1]?.date : undefined;
  const titleId = `${kind.toLowerCase()}-day-title`;
  const arrowClass = "size-11 rounded-xl border border-neutral-800 text-lg hover:enabled:bg-neutral-900 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-emerald-400";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" || !event.isPrimary) return;
        const target = event.target;
        swipeStart.current = target instanceof Element && target.closest("[data-day-swipe]") && !target.closest("button")
          ? { id: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
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
      className={`fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-950 p-0 text-neutral-100 shadow-2xl backdrop:bg-black/75 ${kind === "Alcohol" ? "max-w-2xl" : "max-w-md"}`}
    >
      <div className="p-4 sm:p-5">
        <header data-day-swipe className="touch-pan-y">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} aria-live="polite" className="text-lg font-semibold">{kind} · {shortDate(date)}/{date.slice(0, 4)} · {weekday(date)}</h2>
            <button type="button" autoFocus onClick={() => dialogRef.current?.close()} className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-emerald-400">Close</button>
          </div>
          <div role="group" aria-label="Browse days" className="mt-3 flex justify-between gap-2">
            <button type="button" aria-label="Older day" disabled={!olderDay} onClick={() => olderDay && onNavigate(olderDay)} className={arrowClass}><span aria-hidden="true">&larr;</span></button>
            <button type="button" aria-label="Newer day" disabled={!newerDay} onClick={() => newerDay && onNavigate(newerDay)} className={arrowClass}><span aria-hidden="true">&rarr;</span></button>
          </div>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function AlcoholDayDialog({ entries, ...dialogProps }: DayDialogProps & { entries: AlcoholEntry[] }) {
  const { date } = dialogProps;
  const totalDrinks = entries.reduce((sum, entry) => sum + Number(entry.standard_drinks), 0);
  return (
    <ViceDayDialog {...dialogProps} kind="Alcohol">
        <p data-day-swipe className="mt-4 touch-pan-y text-sm text-neutral-400">
          Total: <span className="font-semibold tabular-nums text-neutral-100">{formatDrinks(totalDrinks)}</span> standard {totalDrinks === 1 ? "drink" : "drinks"}
        </p>
        {entries.length === 0 ? (
          <p data-day-swipe className="touch-pan-y py-8 text-center text-sm text-neutral-500">No alcohol entries for this day.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800 sm:overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm tabular-nums sm:min-w-[460px] sm:table-auto">
              <thead className="bg-neutral-900/60 text-xs text-neutral-500">
                <tr>
                  <th scope="col" className="w-24 px-2 py-3 font-semibold sm:w-auto sm:px-3">Time</th>
                  <th scope="col" className="w-16 px-2 py-3 text-right font-semibold sm:hidden">Drinks</th>
                  <th scope="col" className="px-2 py-3 font-semibold sm:px-3">Label</th>
                  <th scope="col" className="hidden px-3 py-3 text-right font-semibold sm:table-cell">oz</th>
                  <th scope="col" className="hidden px-3 py-3 text-right font-semibold sm:table-cell">ABV</th>
                  <th scope="col" className="hidden px-3 py-3 text-right font-semibold sm:table-cell">Drinks</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const [hour, minute] = entry.occurred_at.split(":");
                  const hourNumber = Number(hour);
                  const time = `${hourNumber % 12 || 12}:${minute} ${hourNumber < 12 ? "AM" : "PM"}`;
                  const drinks = formatDrinks(Number(entry.standard_drinks));
                  return (
                    <tr key={entry.id} className="border-t border-neutral-800 text-neutral-300">
                      <td className="whitespace-nowrap px-2 py-3 sm:px-3">
                        {time}
                        {entry.occurred_on !== date ? <span className="mt-0.5 block text-xs text-neutral-500">{shortDate(entry.occurred_on)}</span> : null}
                      </td>
                      <td className="px-2 py-3 text-right sm:hidden">{drinks}</td>
                      <td className="px-2 py-3 [overflow-wrap:anywhere] sm:max-w-48 sm:px-3">{displayAlcoholLabel(entry.label) || "—"}</td>
                      <td className="hidden px-3 py-3 text-right sm:table-cell">{Number(entry.amount_oz).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="hidden px-3 py-3 text-right sm:table-cell">{Number(entry.abv)}%</td>
                      <td className="hidden px-3 py-3 text-right sm:table-cell">{drinks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </ViceDayDialog>
  );
}

function WeedDayTimeline({ hits }: { hits: WeedHit[] }) {
  const width = 400;
  const left = 24;
  const plotWidth = width - left * 2;
  const x = (hours: number) => left + hours / 24 * plotWidth;

  return (
    <figure className="mt-5 rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 pt-3 pb-2">
      <svg viewBox={`0 0 ${width} 110`} className="mt-2 block h-auto w-full" role="img" aria-label={`${hits.length} hits across the tracking day, from 4 AM to 4 AM local time. Each green mark represents one hit.`}>
        {Array.from({ length: 25 }, (_, hour) => (
          <line key={hour} x1={x(hour)} x2={x(hour)} y1="20" y2="65" stroke="#262626" />
        ))}
        <line x1={left} x2={width - left} y1="65" y2="65" stroke="#525252" />
        {hits.map((hit) => {
          const [hour, minute, second = 0] = hit.occurred_at.split(":").map(Number);
          const hours = ((hour - TRACKING_DAY_START_HOUR + 24) % 24) + minute / 60 + second / 3600;
          const [rawHour, rawMinute] = hit.occurred_at.split(":");
          const time = `${Number(rawHour) % 12 || 12}:${rawMinute} ${Number(rawHour) < 12 ? "AM" : "PM"}`;
          return (
            <line key={hit.id} x1={x(hours)} x2={x(hours)} y1="27" y2="64" stroke="#34d399" strokeWidth="2" strokeLinecap="round">
              <title>{time}</title>
            </line>
          );
        })}
        {[0, 8, 16, 24].map((offset) => {
          const hour = (TRACKING_DAY_START_HOUR + offset) % 24;
          return <text key={offset} x={x(offset)} y="85" textAnchor="middle" fill="#a3a3a3" fontSize="11">{hour % 12 || 12} {hour < 12 ? "AM" : "PM"}</text>;
        })}
      </svg>
    </figure>
  );
}

function WeedDayDialog({ hits, ...dialogProps }: DayDialogProps & { hits: WeedHit[] }) {
  const { date } = dialogProps;
  return (
    <ViceDayDialog {...dialogProps} kind="Weed">
      <div data-day-swipe className="touch-pan-y">
        {hits.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">No hits for this day.</p>
        ) : (
          <>
          <WeedDayTimeline hits={hits} />
          <ul className="mt-4 divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800 text-sm tabular-nums">
            {hits.map((hit) => {
              const [hour, minute] = hit.occurred_at.split(":");
              const hourNumber = Number(hour);
              const time = `${hourNumber % 12 || 12}:${minute} ${hourNumber < 12 ? "AM" : "PM"}`;
              return (
                <li key={hit.id} className="flex items-center justify-between gap-3 px-3 py-3 text-neutral-300">
                  <time dateTime={`${hit.occurred_on}T${hit.occurred_at}`}>{time}</time>
                  {hit.occurred_on !== date ? <span className="text-xs text-neutral-500">{shortDate(hit.occurred_on)}</span> : null}
                </li>
              );
            })}
          </ul>
          </>
        )}
      </div>
    </ViceDayDialog>
  );
}

export default function VicePage() {
  const [weedHits, setWeedHits] = useState<WeedHit[]>([]);
  const [alcoholEntries, setAlcoholEntries] = useState<AlcoholEntry[]>([]);
  const [amountOz, setAmountOz] = useState("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("oz");
  const [abv, setAbv] = useState("");
  const [label, setLabel] = useState("");
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [loading, setLoading] = useState(true);
  const [weedSaving, setWeedSaving] = useState(false);
  const [alcoholSaving, setAlcoholSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pageNow, setPageNow] = useState(() => Date.now());
  const [selectedAlcoholDate, setSelectedAlcoholDate] = useState<string | null>(null);
  const [selectedWeedDate, setSelectedWeedDate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allWeedHits, allAlcoholEntries] = await Promise.all([
        (async () => {
          const rows: WeedHit[] = [];
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error: queryError } = await supabase.from("weed_hits").select("id,user_id,created_at,occurred_on,occurred_at,time_zone").order("occurred_on", { ascending: false }).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
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
            const { data, error: queryError } = await supabase.from("alcohol_entries").select("id,user_id,created_at,occurred_on,occurred_at,time_zone,amount_oz,abv,label,standard_drinks").order("occurred_on", { ascending: false }).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
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

  const drinkPresets = useMemo(() => {
    const byLabel = new Map<string, AlcoholEntry>();
    const newestFirst = alcoholEntries
      .filter((entry) => entry.label?.startsWith(PRESET_LABEL_PREFIX))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const entry of newestFirst) {
      const name = displayAlcoholLabel(entry.label)?.trim();
      if (name && !byLabel.has(name)) byLabel.set(name, entry);
    }
    return [...byLabel].map(([name, entry]) => ({ name, entry }));
  }, [alcoholEntries]);

  const weedDates = useMemo(() => chartDatesFor(weedHits.map((hit) => trackingDate(hit.occurred_on, hit.occurred_at))), [weedHits]);
  const alcoholDates = useMemo(() => chartDatesFor(alcoholEntries.map((entry) => trackingDate(entry.occurred_on, entry.occurred_at))), [alcoholEntries]);
  const weedChart = useMemo(() => {
    const totals = new Map(weedDates.map((date) => [date, 0]));
    weedHits.forEach((hit) => {
      const day = trackingDate(hit.occurred_on, hit.occurred_at);
      if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + 1);
    });
    return weedDates.map((date) => ({ date, value: totals.get(date) ?? 0 }));
  }, [weedDates, weedHits]);
  const alcoholChart = useMemo(() => {
    const totals = new Map(alcoholDates.map((date) => [date, 0]));
    alcoholEntries.forEach((entry) => {
      const day = trackingDate(entry.occurred_on, entry.occurred_at);
      if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + Number(entry.standard_drinks));
    });
    return alcoholDates.map((date) => ({ date, value: totals.get(date) ?? 0 }));
  }, [alcoholDates, alcoholEntries]);

  const dailyTotals = useMemo(() => {
    const drinksByDate = new Map(alcoholChart.map((day) => [day.date, day.value]));
    const hitsByDate = new Map(weedChart.map((day) => [day.date, day.value]));
    return chartDatesFor([...drinksByDate.keys(), ...hitsByDate.keys()])
      .reverse()
      .map((date) => ({ date, drinks: drinksByDate.get(date) ?? 0, hits: hitsByDate.get(date) ?? 0 }));
  }, [alcoholChart, weedChart]);

  const selectedAlcoholEntries = useMemo(() => alcoholEntries
    .filter((entry) => trackingDate(entry.occurred_on, entry.occurred_at) === selectedAlcoholDate)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.occurred_at.localeCompare(b.occurred_at)),
  [alcoholEntries, selectedAlcoholDate]);

  const selectedWeedHits = useMemo(() => weedHits
    .filter((hit) => trackingDate(hit.occurred_on, hit.occurred_at) === selectedWeedDate)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.occurred_at.localeCompare(b.occurred_at)),
  [weedHits, selectedWeedDate]);

  const today = currentTrackingDate();
  const todayWeedHits = weedHits.filter((hit) => trackingDate(hit.occurred_on, hit.occurred_at) === today).length;
  const todayStandardDrinks = alcoholEntries.reduce(
    (total, entry) => trackingDate(entry.occurred_on, entry.occurred_at) === today ? total + Number(entry.standard_drinks) : total,
    0
  );
  const weekStart = subtractISODays(today, 6);
  const weeklyWeedHits = weedHits.filter((hit) => {
    const day = trackingDate(hit.occurred_on, hit.occurred_at);
    return day >= weekStart && day <= today;
  }).length;
  const weeklyStandardDrinks = alcoholEntries.reduce((total, entry) => {
    const day = trackingDate(entry.occurred_on, entry.occurred_at);
    return day >= weekStart && day <= today ? total + Number(entry.standard_drinks) : total;
  }, 0);
  const timeSinceLastHit = weedHits.length > 0
    ? formatElapsed(pageNow - lastEntryTimestamp(weedHits))
    : null;
  const timeSinceLastDrink = alcoholEntries.length > 0
    ? formatElapsed(pageNow - lastEntryTimestamp(alcoholEntries))
    : null;

  async function logWeedHit() {
    if (weedSaving) return;
    setWeedSaving(true);
    setError(null);
    const { data, error: saveError } = await supabase.from("weed_hits").insert(viceLogFields()).select("id,user_id,created_at,occurred_on,occurred_at,time_zone").single();
    setWeedSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setWeedHits((current) => [data as WeedHit, ...current]);
    setPageNow(Date.now());
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
    const trimmedLabel = label.trim();
    if (saveAsPreset && !trimmedLabel) {
      setError("Enter a label to save this drink as a preset.");
      return;
    }
    // Escape ordinary labels that start with a marker so they stay ordinary labels.
    const labelPrefix = saveAsPreset ? PRESET_LABEL_PREFIX
      : trimmedLabel.startsWith(PRESET_LABEL_PREFIX) || trimmedLabel.startsWith(PLAIN_LABEL_PREFIX) ? PLAIN_LABEL_PREFIX : "";
    if ([...trimmedLabel].length + labelPrefix.length > MAX_ALCOHOL_LABEL_LENGTH) {
      setError(`Use a label of ${MAX_ALCOHOL_LABEL_LENGTH - labelPrefix.length} characters or fewer.`);
      return;
    }
    const ounces = amountUnit === "mL" ? enteredAmount / ML_PER_OUNCE : enteredAmount;
    const storedOunces = Math.round(ounces * 100) / 100;
    const standardDrinks = storedOunces * (abvPercent / 100) / 0.6;
    setAlcoholSaving(true);
    setError(null);
    const { data, error: saveError } = await supabase
      .from("alcohol_entries")
      .insert({ ...viceLogFields(), amount_oz: storedOunces, abv: abvPercent, label: trimmedLabel ? `${labelPrefix}${trimmedLabel}` : null, standard_drinks: standardDrinks })
      .select("id,user_id,created_at,occurred_on,occurred_at,time_zone,amount_oz,abv,label,standard_drinks")
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
    setSaveAsPreset(false);
    setPageNow(Date.now());
    setConfirmation(`${formatDrinks(standardDrinks)} standard drinks logged`);
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
            <div className="mt-2 text-center text-sm text-neutral-400"><span className="font-semibold tabular-nums text-neutral-100">{formatDrinks(todayStandardDrinks)}</span> standard drinks today</div>
            <div className="mt-1 text-center text-xs text-neutral-500"><span className="tabular-nums">{formatDrinks(weeklyStandardDrinks)}</span> drinks in last week</div>
            {timeSinceLastDrink ? <div className="mt-1 text-center text-xs tabular-nums text-neutral-500">{timeSinceLastDrink}</div> : null}
          </div>
          <div>
            <button type="button" onClick={logWeedHit} disabled={weedSaving} className="h-28 w-full rounded-3xl bg-white text-5xl font-bold text-neutral-950 shadow-sm transition active:scale-[0.98] disabled:opacity-60" aria-label="Log one weed hit">
              {weedSaving ? "…" : "W"}
            </button>
            <div className="mt-2 text-center text-sm text-neutral-400"><span className="font-semibold tabular-nums text-neutral-100">{todayWeedHits}</span> hits today</div>
            <div className="mt-1 text-center text-xs text-neutral-500"><span className="tabular-nums">{weeklyWeedHits}</span> hits in last week</div>
            {timeSinceLastHit ? <div className="mt-1 text-center text-xs tabular-nums text-neutral-500">{timeSinceLastHit}</div> : null}
          </div>
        </div>

        <div className="mt-3 min-h-6 text-center text-sm text-neutral-400" aria-live="polite">{confirmation}</div>
        {error ? <div className="mt-2 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}

        <form id="alcohol-form" onSubmit={logAlcohol} className="mt-4 rounded-3xl border border-neutral-800 bg-neutral-950/40 p-4 sm:p-5">
          <select
            aria-label="Drink presets"
            value=""
            disabled={drinkPresets.length === 0 || alcoholSaving}
            onChange={(event) => {
              const preset = drinkPresets.find(({ entry }) => entry.id === event.target.value);
              if (!preset) return;
              setLabel(preset.name);
              setAmountOz(String(Number(preset.entry.amount_oz)));
              setAmountUnit("oz");
              setAbv(String(Number(preset.entry.abv)));
              setSaveAsPreset(true);
            }}
            className="mb-3 block w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-base text-neutral-100 outline-none focus:border-neutral-400 disabled:text-neutral-500"
          >
            <option value="" disabled>{loading ? "Loading presets…" : drinkPresets.length ? "Choose a preset" : "No saved presets"}</option>
            {drinkPresets.map(({ name, entry }) => <option key={entry.id} value={entry.id}>{name}</option>)}
          </select>
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
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <label className="block text-xs font-semibold text-neutral-400">Label {!saveAsPreset ? <span className="font-normal text-neutral-600">(optional)</span> : null}
              <input type="text" required={saveAsPreset} maxLength={MAX_ALCOHOL_LABEL_LENGTH - (saveAsPreset ? PRESET_LABEL_PREFIX.length : 0)} value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-neutral-700 bg-black/40 px-3 py-3 text-base text-neutral-100 outline-none focus:border-neutral-400" />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-neutral-300">
              <input type="checkbox" checked={saveAsPreset} onChange={(event) => setSaveAsPreset(event.target.checked)} className="size-4 accent-emerald-400" />
              Preset
            </label>
          </div>
        </form>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/30 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Standard drinks per day</h2>
            <div className="mt-4">{loading ? <div className="py-20 text-center text-sm text-neutral-500">Loading…</div> : <DailyBarChart data={alcoholChart} color="#34d399" unit="drinks" averageDays={30} />}</div>
          </section>
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/30 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Weed hits per day</h2>
            <div className="mt-4">{loading ? <div className="py-20 text-center text-sm text-neutral-500">Loading…</div> : <DailyBarChart data={weedChart} color="#34d399" unit="hits" />}</div>
          </section>
        </div>

        <section aria-labelledby="daily-totals-title" className="mx-auto mt-6 max-w-md rounded-3xl border border-neutral-800 bg-neutral-950/30 p-4 sm:p-5">
          <h2 id="daily-totals-title" className="text-center text-lg font-semibold">Daily totals</h2>
          {loading ? (
            <div className="py-12 text-center text-sm text-neutral-500">Loading…</div>
          ) : (
            <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-2xl border border-neutral-800">
              <table className="w-full table-fixed border-collapse text-sm tabular-nums">
                <thead className="sticky top-0 z-10 bg-neutral-950 text-neutral-400">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left font-semibold">Date</th>
                    <th scope="col" aria-label="Standard drinks" className="w-16 border-l border-neutral-800 py-3 text-center font-semibold sm:w-20">A</th>
                    <th scope="col" aria-label="Weed hits" className="w-16 border-l border-neutral-800 py-3 text-center font-semibold sm:w-20">W</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyTotals.map((day) => (
                    <tr key={day.date} className="border-t border-neutral-800">
                      <th scope="row" className="px-3 text-left font-normal text-neutral-300">
                        <time dateTime={day.date}>{shortDate(day.date)}/{day.date.slice(0, 4)}</time>
                      </th>
                      <td className={`border-l border-neutral-800 p-0 ${day.drinks === 0 ? "bg-emerald-400 text-neutral-950" : "text-neutral-100"}`}>
                        <button type="button" onClick={() => setSelectedAlcoholDate(day.date)} aria-label={`View alcohol entries for ${day.date}`} aria-haspopup="dialog" className="flex h-10 w-full items-center justify-center text-base font-semibold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white">{formatDrinks(day.drinks)}</button>
                      </td>
                      <td className={`border-l border-neutral-800 p-0 ${day.hits === 0 ? "bg-emerald-400 text-neutral-950" : "text-neutral-100"}`}>
                        <button type="button" onClick={() => setSelectedWeedDate(day.date)} aria-label={`View weed hits for ${day.date}`} aria-haspopup="dialog" className="flex h-10 w-full items-center justify-center text-base font-semibold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white">{day.hits}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-6 flex justify-center gap-2 pb-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => downloadCSV("alcohol_entries.csv", [
              ["id", "user_id", "created_at", "amount_oz", "abv", "label", "standard_drinks", "occurred_on", "occurred_at", "time_zone"],
              ...alcoholEntries.map((entry) => [entry.id, entry.user_id, entry.created_at, entry.amount_oz, entry.abv, entry.label, entry.standard_drinks, entry.occurred_on, entry.occurred_at, entry.time_zone]),
            ])}
            className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-1.5 text-xs text-neutral-500 transition hover:text-neutral-300 active:scale-[0.98] disabled:opacity-50"
          >
            Alcohol CSV
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => downloadCSV("weed_hits.csv", [
              ["id", "user_id", "created_at", "occurred_on", "occurred_at", "time_zone"],
              ...weedHits.map((hit) => [hit.id, hit.user_id, hit.created_at, hit.occurred_on, hit.occurred_at, hit.time_zone]),
            ])}
            className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-1.5 text-xs text-neutral-500 transition hover:text-neutral-300 active:scale-[0.98] disabled:opacity-50"
          >
            Weed CSV
          </button>
        </div>
      </div>
      {selectedAlcoholDate ? <AlcoholDayDialog date={selectedAlcoholDate} days={dailyTotals} entries={selectedAlcoholEntries} onNavigate={setSelectedAlcoholDate} onClose={() => setSelectedAlcoholDate(null)} /> : null}
      {selectedWeedDate ? <WeedDayDialog date={selectedWeedDate} days={dailyTotals} hits={selectedWeedHits} onNavigate={setSelectedWeedDate} onClose={() => setSelectedWeedDate(null)} /> : null}
    </main>
  );
}
