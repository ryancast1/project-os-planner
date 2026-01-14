"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { supabase } from "../../../lib/supabaseClient";
type Plan = {
  id: string;
  title: string;
  scheduled_for: string; // YYYY-MM-DD
  starts_at?: string | null;
  status?: string | null;
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
    for (let w = 0; w < 12; w++) {
      const row: Date[] = [];
      const start = addDays(week0, w * 7);
      for (let i = 0; i < 7; i++) row.push(addDays(start, i));
      out.push(row);
    }
    return out;
  }, [week0]);

  const range = useMemo(() => {
    const start = toISODate(weeks[0][0]);
    const end = toISODate(weeks[11][6]);
    return { start, end };
  }, [weeks]);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [loading, setLoading] = useState(true);

  const [openIso, setOpenIso] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [plansRes, tasksRes, focusRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id,title,scheduled_for,starts_at,status")
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
      (m[p.scheduled_for] ||= []).push(p);
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
      (m[f.scheduled_for] ||= []).push(f);
    }
    return m;
  }, [focuses]);

  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function dayModalContent(iso: string) {
    const d = new Date(iso + "T00:00:00");
    const dayPlans = plansByDay[iso] ?? [];
    const dayTasks = tasksByDay[iso] ?? [];
    const dayFocus = focusByDay[iso] ?? [];

    return (
      <div className="w-[min(560px,92vw)] rounded-3xl border border-neutral-800 bg-neutral-950/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-neutral-400">{fmtWeekday(d)}</div>
            <div className="text-xl font-semibold text-neutral-100">{fmtMonthDay(d)}</div>
          </div>
          <button
            onClick={() => setOpenIso(null)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {dayFocus.length > 0 ? (
            <div>
              <div className="mb-2 text-xs text-neutral-400">Focus</div>
              <div className="space-y-1">
                {dayFocus.map((f) => (
                  <div key={f.id} className="truncate italic text-sm text-neutral-200">
                    {f.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {dayPlans.length > 0 ? (
            <div>
              <div className="mb-2 text-xs text-neutral-400">Plans</div>
              <div className="space-y-1">
                {dayPlans.map((p) => (
                  <div key={p.id} className="truncate text-sm text-neutral-100">
                    {p.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {dayTasks.length > 0 ? (
            <div>
              <div className="mb-2 text-xs text-neutral-400">Tasks</div>
              <div className="space-y-1">
                {dayTasks.map((t) => {
                  const done = t.status === "done";
                  return (
                    <div
                      key={t.id}
                      className={clsx(
                        "truncate text-sm",
                        done ? "text-emerald-300" : "text-neutral-100"
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
        <div className="grid grid-cols-7">
          {weekdays.map((w, idx) => (
            <div
              key={w}
              className={clsx(
                "border border-neutral-800 bg-neutral-950/40 px-1 py-1 text-center text-[11px] font-semibold text-neutral-300 sm:text-xs",
                idx >= 5 ? "bg-neutral-900/40" : ""
              )}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 12-week grid */}
        <div
          className={clsx(
            "border-x border-b border-neutral-800",
            // iPhone + iPad portrait: fit all 12 weeks in view
            "h-[calc(100dvh-190px)] md:h-auto",
            "overflow-hidden md:overflow-visible"
          )}
          style={{}}
        >
          <div className="grid grid-rows-12" style={{ gridTemplateRows: "repeat(12, minmax(0, 1fr))" }}>
            {weeks.map((row, wIdx) => {
              const thisMonth = row[0].getMonth();
              const prevMonth = wIdx === 0 ? thisMonth : weeks[wIdx - 1][0].getMonth();
              const monthBreak = wIdx !== 0 && thisMonth !== prevMonth;

              return (
                <div
                  key={`week-${wIdx}`}
                  className={clsx(
                    "grid grid-cols-7",
                    monthBreak ? "border-t-2 border-neutral-500/60" : "border-t border-neutral-800"
                  )}
                >
                  {row.map((d, dIdx) => {
                    const iso = toISODate(d);
                    const dayPlans = plansByDay[iso] ?? [];
                    const show = dayPlans.slice(0, 2);
                    const extra = Math.max(0, dayPlans.length - show.length);
                    const weekend = isWeekend(d);

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
                          "relative border-r border-neutral-800 p-1",
                          weekend ? "bg-neutral-900/35" : "bg-neutral-950/25",
                          dIdx === 6 ? "border-r-0" : "",
                          "select-none"
                        )}
                        style={{ touchAction: "manipulation" }}
                      >
                        <div className="absolute right-1 top-1 text-[10px] text-neutral-400">{d.getDate()}</div>

                        <div className="mt-3 space-y-0.5">
                          {show.map((p) => (
                            <div
                              key={p.id}
                              className="truncate text-[10px] leading-tight text-neutral-200 sm:text-[11px]"
                              title={p.title}
                            >
                              {p.title}
                            </div>
                          ))}
                          {extra > 0 ? (
                            <div className="text-[10px] leading-tight text-neutral-400 sm:text-[11px]">+{extra}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
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