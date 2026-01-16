"use client";

import { useEffect, useMemo, useState } from "react";
import { getLastSession, listSessionsSince, listWeightSeries } from "@/lib/db";

const START_ISO = "2026-01-01";
const DASH_TZ = "America/New_York";

type WorkoutCol = { kind: "workout"; slug: string; label: string };
type MatrixCol = { kind: "date" } | { kind: "spacer" } | WorkoutCol;

// We insert blank spacer columns between your training-day groupings:
// [PU, BC] | [SP, CP, LR, TE] | [LP, RW, RD] | [LP, LC, LE]
const MATRIX_COLS: MatrixCol[] = [
  { kind: "date" },

  { kind: "workout", slug: "push-ups", label: "PU" },
  { kind: "workout", slug: "bicep-curls", label: "BC" },
  { kind: "spacer" },

  { kind: "workout", slug: "shoulder-press", label: "SP" },
  { kind: "workout", slug: "chest-press", label: "CP" },
  { kind: "workout", slug: "lateral-raise", label: "LR" },
  { kind: "workout", slug: "tricep-extension", label: "TE" },
  { kind: "spacer" },

  { kind: "workout", slug: "lat-pulldown", label: "LP" },
  { kind: "workout", slug: "row", label: "RW" },
  { kind: "workout", slug: "rear-delt-fly", label: "RD" },
  { kind: "spacer" },

  { kind: "workout", slug: "leg-press", label: "LP" },
  { kind: "workout", slug: "leg-curl", label: "LC" },
  { kind: "workout", slug: "leg-extension", label: "LE" },
];

const WORKOUTS = MATRIX_COLS.filter((c): c is WorkoutCol => c.kind === "workout");
const WEIGHT_WORKOUTS = WORKOUTS.filter((w) => w.slug !== "push-ups");

const GROUPS: { id: string; items: WorkoutCol[] }[] = [
  { id: "g0", items: WORKOUTS.filter((w) => ["push-ups", "bicep-curls"].includes(w.slug)) },
  {
    id: "g1",
    items: WORKOUTS.filter((w) =>
      ["shoulder-press", "chest-press", "lateral-raise", "tricep-extension"].includes(w.slug)
    ),
  },
  { id: "g2", items: WORKOUTS.filter((w) => ["lat-pulldown", "row", "rear-delt-fly"].includes(w.slug)) },
  { id: "g3", items: WORKOUTS.filter((w) => ["leg-press", "leg-curl", "leg-extension"].includes(w.slug)) },
];

function isoFromUTCDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function utcDateFromISO(iso: string) {
  const [y, m, da] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, da ?? 1));
}

function isoTodayInTZ(tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function todayInTZDate(tz: string) {
  // represent the calendar day as a Date at UTC midnight for that YYYY-MM-DD
  return utcDateFromISO(isoTodayInTZ(tz));
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

// Monday-start week
function mondayOfUTC(d: Date) {
  const day = d.getUTCDay(); // 0=Sun ... 6=Sat
  const offset = (day + 6) % 7; // Mon=0 ... Sun=6
  return addDaysUTC(d, -offset);
}

function fmtMD(iso: string) {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${m}/${d}`;
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((s) => s.slice(0, 1).toUpperCase() + s.slice(1))
    .join(" ");
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<{ performed_on: string; workout_slug: string }[]>([]);

  const [lastBySlug, setLastBySlug] = useState<
    Record<string, { performed_on: string; compact: string | null; notes: string | null } | null>
  >({});

  // weight chart state
  const [weightSlug, setWeightSlug] = useState<string>(() => {
    if (typeof window === "undefined") return "bicep-curls";
    return localStorage.getItem("dash_weight_slug") ?? "bicep-curls";
  });
  const [weightSeries, setWeightSeries] = useState<{ performed_on: string; weight: number }[]>([]);
  const [weightLoading, setWeightLoading] = useState(false);

  // Matrix sizing
  const DATE_COL = 42;
  const CELL = 23;
  const SPACER = 8;
  const matrixCols = MATRIX_COLS.map((c) =>
    c.kind === "date" ? `${DATE_COL}px` : c.kind === "spacer" ? `${SPACER}px` : `${CELL}px`
  ).join(" ");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await listSessionsSince(START_ISO);
        setPairs(data);
      } catch (e: any) {
        alert(`Dashboard load failed: ${e?.message ?? e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const entries = await Promise.all(
          WORKOUTS.map(async (w) => {
            const last = await getLastSession(w.slug);
            if (!last) return [w.slug, null] as const;
            return [
              w.slug,
              {
                performed_on: last.performed_on,
                compact: last.compact ?? null,
                notes: last.notes ?? null,
              },
            ] as const;
          })
        );
        setLastBySlug(Object.fromEntries(entries));
      } catch (e: any) {
        console.error("Last-session list failed:", e);
      }
    })();
  }, [pairs]);

  useEffect(() => {
    if (!weightSlug) return;

    localStorage.setItem("dash_weight_slug", weightSlug);

    (async () => {
      setWeightLoading(true);
      try {
        const rows = await listWeightSeries(weightSlug, START_ISO);
        setWeightSeries(rows);
      } catch (e: any) {
        alert(`Weight chart failed: ${e?.message ?? e}`);
      } finally {
        setWeightLoading(false);
      }
    })();
  }, [weightSlug]);

  const doneSet = useMemo(() => {
    const s = new Set<string>(); // key = "YYYY-MM-DD|slug"
    for (const p of pairs) s.add(`${p.performed_on}|${p.workout_slug}`);
    return s;
  }, [pairs]);

  const anyDaySet = useMemo(() => {
    const s = new Set<string>(); // key = "YYYY-MM-DD"
    for (const p of pairs) s.add(p.performed_on);
    return s;
  }, [pairs]);

  const dayWorkoutCount = useMemo(() => {
    // key: YYYY-MM-DD -> # of logged workout cards that day
    const m = new Map<string, number>();
    const seen = new Set<string>(); // guard against accidental duplicates

    for (const p of pairs) {
      const k = `${p.performed_on}|${p.workout_slug}`;
      if (seen.has(k)) continue;
      seen.add(k);

      m.set(p.performed_on, (m.get(p.performed_on) ?? 0) + 1);
    }

    return m;
  }, [pairs]);

  const dayList = useMemo(() => {
    const end = todayInTZDate(DASH_TZ);
    const start = utcDateFromISO(START_ISO);
    const out: string[] = [];
    for (let d = end; d.getTime() >= start.getTime(); d = addDaysUTC(d, -1)) out.push(isoFromUTCDate(d));
    return out;
  }, []);

  const weekRows = useMemo(() => {
    const end = todayInTZDate(DASH_TZ);
    const start = utcDateFromISO(START_ISO);

    const thisMon = mondayOfUTC(end);
    const firstMon = mondayOfUTC(start);

    const rows: string[][] = [];
    for (let wk = thisMon; wk.getTime() >= firstMon.getTime(); wk = addDaysUTC(wk, -7)) {
      const row: string[] = [];
      for (let i = 0; i < 7; i++) row.push(isoFromUTCDate(addDaysUTC(wk, i)));
      rows.push(row);
    }
    return rows;
  }, []);

  const todayISO = isoTodayInTZ(DASH_TZ);

  const MatrixCard = (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mt-2">
        <div className="grid gap-0" style={{ gridTemplateColumns: matrixCols }}>
          {MATRIX_COLS.map((c, i) => {
            if (c.kind === "date") {
              return (
                <div key="date" className="h-[22px] px-1 flex items-center justify-center text-[11px] text-white/70">
                  Date
                </div>
              );
            }
            if (c.kind === "spacer") return <div key={`sp-h-${i}`} className="py-2" />;
            return (
              <div key={c.slug} className="py-2 text-[11px] text-white/70 text-center" title={c.slug}>
                {c.label}
              </div>
            );
          })}
        </div>

        <div className="mt-1">
          {dayList.map((iso) => (
            <div
              key={iso}
              className={[
                "grid gap-0",
                // add a subtle week break above Mondays (Mon follows Sun), e.g. between 1/4 and 1/5
                utcDateFromISO(iso).getUTCDay() === 0 && iso !== dayList[0] ? "mt-2" : "mt-0",
              ].join(" ")}
              style={{ gridTemplateColumns: matrixCols }}
            >
              {MATRIX_COLS.map((c, i) => {
                if (c.kind === "date") {
                  return (
                    <div key={`d-${iso}`} className="h-[22px] px-1 flex items-center justify-center text-[11px] text-white/70">
                      {fmtMD(iso)}
                    </div>
                  );
                }
                if (c.kind === "spacer") return <div key={`sp-${iso}-${i}`} className="h-[22px]" />;

                const filled = doneSet.has(`${iso}|${c.slug}`);
                return (
                  <div
                    key={`${iso}-${c.slug}`}
                    className={[
                      "h-[22px] border rounded-sm",
                      filled ? "bg-emerald-500/80 border-emerald-400/60" : "bg-white/5 border-white/10",
                    ].join(" ")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const AnyWorkoutCard = (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
      <div
        className="mt-2 grid gap-0 text-[11px] text-white/60"
        style={{ gridTemplateColumns: "repeat(7, 1fr) 28px" }}
      >
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={`${d}-${i}`} className="text-center py-1">
            {d}
          </div>
        ))}
        <div />
      </div>

      <div className="mt-1 space-y-1">
        {weekRows.map((row, idx) => (
          <div
            key={idx}
            className="grid gap-0"
            style={{ gridTemplateColumns: "repeat(7, 1fr) 28px" }}
          >
            {row.map((iso) => {
              const isBeforeStart = iso < START_ISO;
              const isAfterToday = iso > todayISO;
              const filled = anyDaySet.has(iso);

              const cls =
                isBeforeStart || isAfterToday
                  ? "bg-transparent border-white/5"
                  : filled
                  ? "bg-emerald-500/80 border-emerald-400/60"
                  : "bg-white/5 border-white/10";

              const dayNum = Number(iso.slice(8, 10));
              const showNum = !isBeforeStart && !isAfterToday;

              return (
                <div
                  key={iso}
                  className={[
                    "h-8 border rounded-sm flex items-center justify-center text-[10px]",
                    cls,
                    filled ? "text-black/80" : "text-white/35",
                  ].join(" ")}
                >
                  {showNum ? dayNum : ""}
                </div>
              );
            })}
            {(() => {
              const weekCount = row.reduce((sum, iso) => {
                if (iso < START_ISO || iso > todayISO) return sum;
                return sum + (dayWorkoutCount.get(iso) ?? 0);
              }, 0);

              return (
                <div className="h-8 flex items-center justify-center text-[11px] text-white/70">
                  {weekCount}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </section>
  );

  const WeightCard = (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mt-1">
        <div className="mb-1 text-xs text-white/60 text-center">Exercise</div>
        <select
          value={weightSlug}
          onChange={(e) => setWeightSlug(e.target.value)}
          className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-white"
        >
          {WEIGHT_WORKOUTS.map((w) => (
            <option key={w.slug} value={w.slug}>
              {w.label} — {titleFromSlug(w.slug)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {weightLoading ? (
          <div className="text-center text-white/60 text-sm py-8">Loading…</div>
        ) : weightSeries.length < 2 ? (
          <div className="text-center text-white/60 text-sm py-8">Not enough data yet.</div>
        ) : (
          <WeightLineChart data={weightSeries} />
        )}
      </div>
    </section>
  );

  const LastCardItem = (w: WorkoutCol, keyPrefix: string) => {
    const last = lastBySlug[w.slug] ?? null;
    return (
      <div key={`${keyPrefix}-${w.slug}`} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-white/85 truncate">
              <span className="text-white/60 mr-2">{w.label}</span>
              <span className="font-semibold">{titleFromSlug(w.slug)}</span>
            </div>
          </div>

          <div className="shrink-0 text-xs text-white/55">{last?.performed_on ? fmtMD(last.performed_on) : "—"}</div>
        </div>

        <div className="mt-1 text-sm">
          <span className="text-white/80 font-semibold">{last?.compact ?? "—"}</span>
        </div>

        {last?.notes ? <div className="mt-1 text-xs text-white/55 whitespace-pre-wrap">{last.notes}</div> : null}
      </div>
    );
  };

  return (
    <main className="min-h-screen md:h-screen md:overflow-hidden bg-gradient-to-b from-black to-zinc-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md md:max-w-7xl md:h-full md:flex md:flex-col">
        <h1 className="text-3xl font-semibold tracking-tight text-center">Dashboard</h1>

        {loading ? (
          <div className="mt-8 text-center text-white/60">Loading…</div>
        ) : (
          <div className="mt-6 md:flex-1 md:overflow-hidden">
            {/* MOBILE (keep old stacking, but add group spacers in the last list) */}
            <div className="space-y-6 md:hidden">
              {MatrixCard}
              {AnyWorkoutCard}
              {WeightCard}

              <div className="space-y-6">
                {GROUPS.map((g) => (
                  <section
                    key={g.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="space-y-3">{g.items.map((w) => LastCardItem(w, `m-${g.id}`))}</div>
                  </section>
                ))}
              </div>
            </div>

            {/* DESKTOP / HORIZONTAL SCREENS */}
            <div className="hidden md:flex md:flex-col md:h-full md:overflow-hidden">
              {/* Top row: Matrix | Any workout | Weight */}
              <div className="grid gap-6 items-start grid-cols-[minmax(380px,460px)_minmax(280px,340px)_minmax(420px,520px)]">
                {MatrixCard}
                {AnyWorkoutCard}
                {WeightCard}
              </div>

              {/* Bottom half: 4 independent scroll panes (one per grouping) */}
              <div className="mt-6 flex-1 overflow-hidden">
                <div className="h-full grid grid-cols-4 gap-6">
                  {GROUPS.map((g) => (
                    <section
                      key={g.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 overflow-hidden flex flex-col"
                    >
                      <div className="flex-1 overflow-y-auto pr-2">
                        <div className="space-y-3">{g.items.map((w) => LastCardItem(w, `d-${g.id}`))}</div>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function WeightLineChart({ data }: { data: { performed_on: string; weight: number }[] }) {
  const W = 320;
  const H = 180;
  const padL = 32;
  const padR = 10;
  const padT = 10;
  const padB = 22;

  const weights = data.map((d) => Number(d.weight)).filter((x) => Number.isFinite(x));
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const spread = Math.max(1, maxW - minW);
  const yMin = minW - spread * 0.08;
  const yMax = maxW + spread * 0.08;

  const x0 = padL;
  const x1 = W - padR;
  const y0 = H - padB;
  const y1 = padT;

  const n = data.length;

  const xFor = (i: number) => (n === 1 ? x0 : x0 + (i * (x1 - x0)) / (n - 1));
  const yFor = (w: number) => y0 - ((w - yMin) * (y0 - y1)) / (yMax - yMin);

  const path = data
    .map((d, i) => {
      const x = xFor(i);
      const y = yFor(Number(d.weight));
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const fmt = (iso: string) => {
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    return `${m}/${d}`;
  };

  const firstDate = data[0]?.performed_on ?? "";
  const lastDate = data[data.length - 1]?.performed_on ?? "";

  return (
    <div className="w-full">
      <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px]">
          <text x={padL - 6} y={y1 + 10} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.55)">
            {Math.round(yMax)}
          </text>
          <text x={padL - 6} y={y0} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.55)">
            {Math.round(yMin)}
          </text>

          <line x1={padL} y1={y0} x2={x1} y2={y0} stroke="rgba(255,255,255,0.10)" />

          <path d={path} fill="none" stroke="rgba(16,185,129,0.95)" strokeWidth="2" />

          {(() => {
            const i = n - 1;
            const x = xFor(i);
            const y = yFor(Number(data[i].weight));
            return <circle cx={x} cy={y} r="3.5" fill="rgba(16,185,129,0.95)" />;
          })()}

          <text x={padL} y={H - 6} fontSize="10" fill="rgba(255,255,255,0.50)">
            {fmt(firstDate)}
          </text>
          <text x={x1} y={H - 6} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.50)">
            {fmt(lastDate)}
          </text>
        </svg>
      </div>

      <div className="mt-2 text-center text-xs text-white/50">
        {n} points • {Math.round(minW)}–{Math.round(maxW)}
      </div>
    </div>
  );
}