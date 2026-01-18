"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { supabase } from "../../../lib/supabaseClient";
type Plan = {
  id: string;
  title: string;
  scheduled_for: string; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  starts_at?: string | null;
  status?: string | null;
  day_off?: boolean | null;
};

type Task = {
  id: string;
  title: string;
  scheduled_for: string;
  status: string;
};

type Focus = {
  id: string;
  title: string;
  scheduled_for: string;
  status?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoMax(a: string, b: string) {
  return a >= b ? a : b;
}

function isoMin(a: string, b: string) {
  return a <= b ? a : b;
}

function planEndIso(p: Plan) {
  return (p.end_date ?? p.scheduled_for) || p.scheduled_for;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7; // Mon=0
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtWeekday(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function fmtMonthDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function isWeekend(d: Date) {
  const g = d.getDay();
  return g === 0 || g === 6;
}

function useLongPress(opts: {
  onLongPress: () => void;
  ms?: number;
  moveThresholdPx?: number;
}) {
  const { onLongPress, ms = 450, moveThresholdPx = 10 } = opts;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  function clear() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
    firedRef.current = false;
  }

  function onPointerDown(e: React.PointerEvent) {
    // Avoid iOS long-press text selection/callout.
    if (e.pointerType === "touch") {
      e.preventDefault();
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    firedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, ms);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current || !timerRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > moveThresholdPx) {
      clear();
    }
  }

  function onPointerUp() {
    if (firedRef.current) {
      // keep modal open; just clear refs
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      startRef.current = null;
      return;
    }
    clear();
  }

  function onPointerCancel() {
    clear();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

export default function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const week0 = useMemo(() => startOfWeekMonday(today), [today]);

  const weeks = useMemo(() => {
    const out: Date[][] = [];
    for (let w = 0; w < 13; w++) {
      const row: Date[] = [];
      const start = addDays(week0, w * 7);
      for (let i = 0; i < 7; i++) row.push(addDays(start, i));
      out.push(row);
    }
    return out;
  }, [week0]);

  const range = useMemo(() => {
    const start = toISODate(weeks[0][0]);
    const end = toISODate(weeks[12][6]);
    return { start, end };
  }, [weeks]);

  const todayIso = useMemo(() => toISODate(today), [today]);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [loading, setLoading] = useState(true);

  const [openIso, setOpenIso] = useState<string | null>(null);

  const [maxPlansPerCell, setMaxPlansPerCell] = useState(3);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    function compute() {
      // Tailwind md breakpoint ~768px. Treat md+ as iPad/Mac: show more.
      const w = window.innerWidth || 0;
      const wide = w >= 768;
      setIsWide(wide);
      setMaxPlansPerCell(wide ? 5 : 3);
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [plansRes, tasksRes, focusRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id,title,scheduled_for,end_date,starts_at,status,day_off")
          .gte("scheduled_for", range.start)
          .lte("scheduled_for", range.end)
          .order("scheduled_for", { ascending: true })
          .order("starts_at", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("tasks")
          .select("id,title,scheduled_for,status")
          .gte("scheduled_for", range.start)
          .lte("scheduled_for", range.end)
          .order("scheduled_for", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("focuses")
          .select("id,title,scheduled_for,status")
          .gte("scheduled_for", range.start)
          .lte("scheduled_for", range.end)
          .order("scheduled_for", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (!alive) return;
      if (plansRes.error) console.error(plansRes.error);
      if (tasksRes.error) console.error(tasksRes.error);
      if (focusRes.error) console.error(focusRes.error);

      setPlans((plansRes.data ?? []) as Plan[]);
      setTasks((tasksRes.data ?? []) as Task[]);
      setFocuses((focusRes.data ?? []) as Focus[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [range.start, range.end]);

  const plansByDay = useMemo(() => {
    const m: Record<string, Plan[]> = {};
    for (const p of plans) {
      if (!p.scheduled_for) continue;
      const endIso = planEndIso(p);
      // Only show single-day plans inside cells; multi-day plans render as bars.
      if (endIso !== p.scheduled_for) continue;
      (m[p.scheduled_for] ||= []).push(p);
    }
    return m;
  }, [plans]);

  const dayOffByDay = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const p of plans) {
      if (!p.scheduled_for) continue;
      if (!p.day_off) continue;
      const start = p.scheduled_for;
      const end = planEndIso(p);
      let cur = start;
      while (cur <= end) {
        m[cur] = true;
        const d = new Date(cur + "T00:00:00");
        d.setDate(d.getDate() + 1);
        cur = toISODate(d);
      }
    }
    return m;
  }, [plans]);

  const tasksByDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.scheduled_for) continue;
      (m[t.scheduled_for] ||= []).push(t);
    }
    return m;
  }, [tasks]);

  const focusByDay = useMemo(() => {
    const m: Record<string, Focus[]> = {};
    for (const f of focuses) {
      if (!f.scheduled_for) continue;
      const st = String(f.status ?? "").toLowerCase();
      if (st === "archived") continue;
      (m[f.scheduled_for] ||= []).push(f);
    }
    return m;
  }, [focuses]);

  const multiDayPlans = useMemo(() => {
    return plans
      .filter((p) => p.scheduled_for)
      .map((p) => ({ ...p, _end: planEndIso(p) }))
      .filter((p) => p._end && p._end !== p.scheduled_for)
      .sort((a, b) => {
        if (a.scheduled_for !== b.scheduled_for) return a.scheduled_for.localeCompare(b.scheduled_for);
        return a._end.localeCompare(b._end);
      });
  }, [plans]);

  type WeekSpan = {
    key: string;
    title: string;
    startCol: number; // 0..6
    endCol: number; // 0..6
    continuesLeft: boolean;
    continuesRight: boolean;
    lane: number;
  };

  const spansByWeek = useMemo(() => {
    return weeks.map((row) => {
      const weekStartIso = toISODate(row[0]);
      const weekEndIso = toISODate(row[6]);

      const raw: Omit<WeekSpan, "lane">[] = [];

      for (const p of multiDayPlans as Array<Plan & { _end: string }>) {
        const startIso = p.scheduled_for;
        const endIso = p._end;

        // No overlap
        if (endIso < weekStartIso || startIso > weekEndIso) continue;

        const segStart = isoMax(startIso, weekStartIso);
        const segEnd = isoMin(endIso, weekEndIso);

        const startCol = row.findIndex((d) => toISODate(d) === segStart);
        const endCol = row.findIndex((d) => toISODate(d) === segEnd);
        if (startCol < 0 || endCol < 0) continue;

        raw.push({
          key: `${p.id}-${weekStartIso}`,
          title: p.title,
          startCol,
          endCol,
          continuesLeft: startIso < weekStartIso,
          continuesRight: endIso > weekEndIso,
        });
      }

      // Lane assignment so overlapping bars stack.
      raw.sort((a, b) => (a.startCol - b.startCol) || (a.endCol - b.endCol) || a.title.localeCompare(b.title));
      const laneEnd: number[] = [];
      const spans: WeekSpan[] = [];

      for (const s of raw) {
        let lane = 0;
        while (lane < laneEnd.length) {
          if (s.startCol > laneEnd[lane]) break;
          lane++;
        }
        if (lane === laneEnd.length) laneEnd.push(s.endCol);
        else laneEnd[lane] = s.endCol;
        spans.push({ ...s, lane });
      }

      return spans;
    });
  }, [weeks, multiDayPlans]);

  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function dayModalContent(iso: string) {
    const d = new Date(iso + "T00:00:00");
    const dayPlans = plans
      .filter((p) => p.scheduled_for)
      .filter((p) => {
        const start = p.scheduled_for;
        const end = planEndIso(p);
        return start <= iso && iso <= end;
      })
      .sort((a, b) => {
        const aEnd = planEndIso(a);
        const bEnd = planEndIso(b);
        if (a.scheduled_for !== b.scheduled_for) return a.scheduled_for.localeCompare(b.scheduled_for);
        if (aEnd !== bEnd) return aEnd.localeCompare(bEnd);
        return (a.starts_at ?? "").localeCompare(b.starts_at ?? "");
      });
    const dayTasks = tasksByDay[iso] ?? [];
    const dayFocus = (focusByDay[iso] ?? []).filter(
      (f) => String(f.status ?? "").toLowerCase() !== "archived"
    );

    return (
      <div className="w-[min(560px,92vw)] rounded-3xl border border-neutral-700/60 bg-neutral-950/98 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-neutral-400">{fmtWeekday(d)}</div>
            <div className="text-xl font-semibold text-neutral-50 tracking-tight">{fmtMonthDay(d)}</div>
          </div>
          <button
            onClick={() => setOpenIso(null)}
            className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800/80 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {dayFocus.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Intentions</div>
              <div className="space-y-1.5">
                {dayFocus.map((f) => (
                  <div key={f.id} className="truncate italic text-sm text-neutral-100">
                    {f.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {dayPlans.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Plans</div>
              <div className="space-y-1.5">
                {dayPlans.map((p) => (
                  <div key={p.id} className="truncate text-sm text-neutral-50">
                    {p.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {dayTasks.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Tasks</div>
              <div className="space-y-1.5">
                {dayTasks.map((t) => {
                  const done = t.status === "done";
                  return (
                    <div
                      key={t.id}
                      className={clsx(
                        "truncate text-sm font-medium",
                        done ? "text-emerald-400" : "text-neutral-50"
                      )}
                    >
                      {done ? "✓ " : ""}
                      {t.title}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {dayFocus.length === 0 && dayPlans.length === 0 && dayTasks.length === 0 ? (
            <div className="text-sm text-neutral-400">Nothing scheduled.</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh px-3 py-3 pb-28 sm:px-6 sm:py-6">
      {/* Weekday headers */}
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="grid grid-cols-7 shadow-sm">
          {weekdays.map((w, idx) => (
            <div
              key={w}
              className={clsx(
                "border-r border-b border-neutral-700/50 bg-neutral-900/60 px-0.5 py-2 text-center text-[10px] font-medium tracking-wide leading-none text-neutral-200 sm:text-xs md:landscape:text-sm",
                idx === 6 ? "border-r-0" : "",
                idx >= 5 ? "bg-neutral-800/60" : ""
              )}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 13-week grid */}
        <div className="border-x border-b border-neutral-700/50 shadow-lg">
          <div>
            {weeks.map((row, wIdx) => {
              return (
                <div key={`week-${wIdx}`} className="relative">
                  <div className="grid grid-cols-7">
                    {row.map((d, dIdx) => {
                      const iso = toISODate(d);
                      const isToday = iso === todayIso;
                      const dayPlans = plansByDay[iso] ?? [];
                      const show = dayPlans.slice(0, maxPlansPerCell);
                      const extra = Math.max(0, dayPlans.length - show.length);
                      const weekend = isWeekend(d);
                      const dayOff = !!dayOffByDay[iso];

                      const monthChangeFromTop =
                        wIdx > 0 && weeks[wIdx - 1][dIdx].getMonth() !== d.getMonth();
                      const monthChangeFromLeft =
                        dIdx > 0 && row[dIdx - 1].getMonth() !== d.getMonth();

                      const lp = useLongPress({
                        onLongPress: () => setOpenIso(iso),
                        ms: 450,
                      });

                      return (
                        <div
                          key={iso}
                          {...lp}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setOpenIso(iso);
                          }}
                          className={clsx(
                            "relative p-1 select-none aspect-square transition-colors",
                            // grid lines
                            dIdx === 6 ? "border-r-0" : "border-r border-r-neutral-700/40",
                            // top border for every cell; thicker when month changes vs the cell above
                            monthChangeFromTop ? "border-t-2 border-t-neutral-500/70" : "border-t border-t-neutral-700/40",
                            // thicker left border when month changes vs the cell to the left (e.g., Jan 31 -> Feb 1)
                            monthChangeFromLeft ? "border-l-2 border-l-neutral-500/70" : "",
                            isToday
                              ? "bg-neutral-600/55 ring-2 ring-inset ring-neutral-200/40 shadow-inner"
                              : (weekend || dayOff)
                                ? "bg-neutral-800/50"
                                : "bg-neutral-950/30"
                          )}
                          style={{ touchAction: "manipulation" }}
                        >
                          <div className="absolute right-1 top-1 text-[10px] font-medium text-neutral-400 md:landscape:text-xs">{d.getDate()}</div>

                          <div className="mt-5 space-y-0.5 sm:space-y-1 landscape:space-y-1 md:landscape:space-y-2 md:landscape:mt-0 md:landscape:h-full md:landscape:pt-5 md:landscape:pb-2 md:landscape:flex md:landscape:flex-col md:landscape:justify-center">
                            {show.map((p) => (
                              <div
                                key={p.id}
                                className="text-center whitespace-nowrap overflow-hidden text-ellipsis text-[8px] leading-tight text-neutral-100 font-normal sm:text-[11px] landscape:whitespace-normal landscape:overflow-visible landscape:text-clip landscape:break-words landscape:text-center md:landscape:text-[13px] md:landscape:whitespace-normal md:landscape:overflow-visible md:landscape:text-clip md:landscape:break-words md:landscape:text-center"
                                title={p.title}
                              >
                                {p.title}
                              </div>
                            ))}
                            {extra > 0 ? (
                              <div className="text-center whitespace-nowrap overflow-hidden text-ellipsis text-[8px] leading-tight text-neutral-400 font-medium sm:text-[11px] landscape:whitespace-normal landscape:overflow-visible landscape:text-clip landscape:text-center md:landscape:text-[13px] md:landscape:whitespace-normal md:landscape:overflow-visible md:landscape:text-clip md:landscape:text-center">+{extra}</div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Multi-day plan bars */}
                  {spansByWeek[wIdx]?.length ? (
                    <div
                      className={clsx(
                        "pointer-events-none absolute inset-0 grid grid-cols-7",
                        // On small screens we stack bars near the bottom so they don't cover day numbers / plan text.
                        isWide ? "items-start" : "items-end"
                      )}
                    >
                      {spansByWeek[wIdx].map((s) => {
                        // Desktop/iPad landscape: a little lower than before to leave a tiny gap under day numbers.
                        const top = 22 + s.lane * 16;
                        // Mobile: stack from the bottom up. Use thinner bars + tighter stacking.
                        const bottom = 4 + s.lane * 8;

                        return (
                          <div
                            key={s.key}
                            style={
                              isWide
                                ? { gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`, marginTop: top }
                                : { gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`, marginBottom: bottom }
                            }
                            className="z-10 px-1"
                          >
                            <div
                              className={clsx(
                                "w-full border border-neutral-200/30 bg-neutral-200/10 backdrop-blur shadow-sm",
                                isWide
                                  ? "rounded-md px-1.5 py-1 text-[11px] leading-none text-neutral-100 font-medium"
                                  : "rounded-sm px-1 text-[8px] leading-none text-neutral-100 font-medium h-3 flex items-center"
                              )}
                            >
                              <div className="flex w-full items-center justify-center gap-1 overflow-hidden">
                                {s.continuesLeft ? (
                                  <span className={clsx("shrink-0", isWide ? "text-neutral-200/80" : "text-neutral-200/60")}>←</span>
                                ) : null}
                                <span
                                  className={clsx(
                                    "min-w-0 truncate text-center",
                                    isWide ? "max-w-full" : "max-w-full"
                                  )}
                                  title={s.title}
                                >
                                  {s.title}
                                </span>
                                {s.continuesRight ? (
                                  <span className={clsx("shrink-0", isWide ? "text-neutral-200/80" : "text-neutral-200/60")}>→</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="mt-3 text-xs text-neutral-500">Loading…</div>
        ) : null}
      </div>

      {/* Modal */}
      {openIso ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4"
          onPointerDown={(e) => {
            // click outside closes
            if (e.target === e.currentTarget) setOpenIso(null);
          }}
        >
          {dayModalContent(openIso)}
        </div>
      ) : null}
    </main>
  );
}