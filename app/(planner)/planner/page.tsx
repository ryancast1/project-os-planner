"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";


type WindowKind = "workweek" | "weekend";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: "open" | "done" | "canceled";
  scheduled_for: string | null; // YYYY-MM-DD
  window_kind: WindowKind | null;
  window_start: string | null; // YYYY-MM-DD
  project_goal_id: string | null;
  created_at: string;
  completed_at?: string | null;
};

type Plan = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string | null; // ISO (optional time)
  ends_at: string | null; // ISO (optional time)  <-- keep, but NOT used for multi-day
  end_date: string | null; // YYYY-MM-DD (multi-day end)
  day_off: boolean | null; // day off flag (calendar shading)
  status: "open" | "done" | "canceled";
  scheduled_for: string | null; // YYYY-MM-DD
  window_kind: WindowKind | null;
  window_start: string | null; // YYYY-MM-DD
  project_goal_id: string | null;
  created_at: string;
  completed_at?: string | null;
};


type Focus = {
  id: string;
  title: string;
  notes: string | null;
  status: "active" | "archived";
  scheduled_for: string | null; // YYYY-MM-DD
  window_kind: WindowKind | null;
  window_start: string | null; // YYYY-MM-DD
  content_category?: string | null; // cook/watch/listen/read (movies handled separately)
  project_goal_id: string | null;
  created_at: string;
};

type Habit = {
  id: string;
  name: string;
  short_label: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
};

type HabitLog = {
  habit_id: string;
  done_on: string; // YYYY-MM-DD
};

type ItemType = "task" | "plan" | "focus";


type DrawerWindow = "thisWeek" | "thisWeekend" | "nextWeek" | "nextWeekend" | "open";

type ContentTab = "cook" | "watch" | "movies" | "city" | "listen" | "read"| "listen" ;

type ContentItem = {
  id: string;
  text: string;
  created_at: string; // ISO
};


type MovieTrackerItem = {
  id: string;
  title: string;
  priority: number | null;
};

type ProjectGoal = {
  id: string;
  goal: string;
  bucket: string;
  archived: boolean;
  created_at: string;
};

type MoveTarget = { label: string; value: string; group: "days" | "parking" };

type PlanningWindows = {
  thisWeekStart: string; // Monday
  nextWeekStart: string; // Monday
  thisWeekendStart: string; // Saturday
  nextWeekendStart: string; // Saturday
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromISODate(iso: string) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function fmtDayLabel(d: Date, index: number) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function fmtMonthDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function isoToTimeInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Mon=0
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function upcomingSaturday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const daysUntilSat = (6 - day + 7) % 7;
  x.setDate(x.getDate() + daysUntilSat);
  return x;
}

function computePlanningWindows(today: Date): PlanningWindows {
  const dow = today.getDay(); // 0 Sun ... 6 Sat

  // Workweek planning rolls over at weekend: Sat/Sun plan for next Mon-Fri
  const baseWeekMonday = startOfWeekMonday(today);
  const planningWeekMonday = dow === 6 || dow === 0 ? addDays(baseWeekMonday, 7) : baseWeekMonday;

  // Weekend planning: Mon-Fri refers to upcoming weekend; Sat/Sun refers to current weekend
  const thisWeekendSat = dow === 6 ? today : dow === 0 ? addDays(today, -1) : upcomingSaturday(today);

  const thisWeekStart = toISODate(planningWeekMonday);
  const nextWeekStart = toISODate(addDays(planningWeekMonday, 7));
  const thisWeekendStart = toISODate(thisWeekendSat);
  const nextWeekendStart = toISODate(addDays(thisWeekendSat, 7));

  return { thisWeekStart, nextWeekStart, thisWeekendStart, nextWeekendStart };
}

function nextWeekdayISO(from: Date, targetWeekday: number) {
  // weekday: 0=Sun ... 6=Sat
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const cur = d.getDay();
  let delta = (targetWeekday - cur + 7) % 7;
  if (delta === 0) delta = 7; // next occurrence
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

type ParsedAdd = {
  title: string;
  targetValue: string; // none | D|YYYY-MM-DD | P|kind|start
  itemType: ItemType;
};

function parseHashtags(
  raw: string,
  defaults: { targetValue: string; today: Date; windows: PlanningWindows; itemType: ItemType }
): ParsedAdd {
  const { targetValue: defaultTarget, today, windows, itemType: defaultType } = defaults;

  const parts = raw.trim().split(/\s+/).filter(Boolean);
  let targetValue = defaultTarget;
  let itemType: ItemType = defaultType;

  const kept: string[] = [];

  const setParking = (which: "thisWeek" | "thisWeekend" | "nextWeek" | "nextWeekend") => {
    if (which === "thisWeek") targetValue = `P|workweek|${windows.thisWeekStart}`;
    if (which === "thisWeekend") targetValue = `P|weekend|${windows.thisWeekendStart}`;
    if (which === "nextWeek") targetValue = `P|workweek|${windows.nextWeekStart}`;
    if (which === "nextWeekend") targetValue = `P|weekend|${windows.nextWeekendStart}`;
  };

  const weekdayMap: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    weds: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };

  for (const p of parts) {
    if (!p.startsWith("#") || p.length < 2) {
      kept.push(p);
      continue;
    }

    const tag = p.slice(1).toLowerCase().replace(/[^a-z]/g, "");

    // type tags
    if (tag === "task" || tag === "tasks") {
      itemType = "task";
      continue;
    }
    if (tag === "plan" || tag === "plans") {
      itemType = "plan";
      continue;
    }
    if (tag === "focus" || tag === "focuses") {
      itemType = "focus";
      continue;
    }

    // date-ish
    if (tag === "today") {
      targetValue = `D|${toISODate(today)}`;
      continue;
    }
    if (tag === "tomorrow") {
      targetValue = `D|${toISODate(addDays(today, 1))}`;
      continue;
    }

    // parking shortcuts
    if (tag === "thisweek" || tag === "week") {
      setParking("thisWeek");
      continue;
    }
    if (tag === "thisweekend" || tag === "weekend") {
      setParking("thisWeekend");
      continue;
    }
    if (tag === "nextweek") {
      setParking("nextWeek");
      continue;
    }
    if (tag === "nextweekend") {
      setParking("nextWeekend");
      continue;
    }

    if (tag === "nodate" || tag === "someday" || tag === "later") {
      targetValue = "none";
      continue;
    }

    // weekday shortcuts
    if (weekdayMap[tag] !== undefined) {
      const iso = nextWeekdayISO(today, weekdayMap[tag]);
      targetValue = `D|${iso}`;
      continue;
    }

    // unknown hashtag: keep it
    kept.push(p);
  }

  return { title: kept.join(" ").trim(), targetValue, itemType };
}

function locationValueFor(item: { scheduled_for: string | null; window_kind: WindowKind | null; window_start: string | null }) {
  if (item.scheduled_for) return `D|${item.scheduled_for}`;
  if (item.window_kind && item.window_start) return `P|${item.window_kind}|${item.window_start}`;
  return "none";
}

function TimePill({ startsAt, endsAt }: { startsAt: string | null; endsAt: string | null }) {
  if (!startsAt && !endsAt) return null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const text = startsAt && endsAt ? `${fmt(startsAt)}–${fmt(endsAt)}` : startsAt ? fmt(startsAt) : "";
  return (
    <span className="ml-2 rounded-md border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[11px] text-neutral-300">
      {text}
    </span>
  );
}

function RowShell({
  tone,
  children,
  onEdit,
  onTap,
  compact,
}: {
  tone?: "normal" | "overdue";
  children: React.ReactNode;
  onEdit?: () => void;
  onTap?: () => void;
  compact?: boolean;
}) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("button,select,input,textarea,a,label"));
  };

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onEdit) return;

    // Long-press edit ONLY on touch. Desktop uses right-click.
    if (e.pointerType !== "touch") return;

    // If they pressed on a control inside the row (checkbox/move select), do not arm edit.
    if (isInteractiveTarget(e.target)) return;

    clear();
    startRef.current = { x: e.clientX, y: e.clientY };

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startRef.current = null;
      onEdit();
    }, 650);
  };

  const maybeCancelOnMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    if (!timerRef.current) return;
    if (!startRef.current) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 10 * 10) {
      // user is scrolling/dragging
      clear();
    }
  };

  return (
    <div
      className={clsx(
        "flex items-center border-b border-neutral-800 last:border-b-0",
        compact ? "gap-1 px-2 py-1" : "gap-2 px-3 py-2",
        tone === "overdue" ? "bg-red-950/20" : "bg-transparent"
      )}
      onClick={(e) => {
        if (!onTap) return;
        if (isInteractiveTarget(e.target)) return;
        onTap();
      }}
      onPointerDown={start}
      onPointerMove={maybeCancelOnMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        if (!onEdit) return;
        e.preventDefault();
        onEdit();
      }}
      style={{ touchAction: "manipulation" }}
    >
      {children}
    </div>
  );
}

function MoveSelect({
  value,
  onChange,
  moveTargets,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  moveTargets: MoveTarget[];
  compact?: boolean;
}) {
  const dayTargets = moveTargets.filter((t) => t.group === "days");
  const parkingTargets = moveTargets.filter((t) => t.group === "parking");

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-neutral-200 outline-none",
        compact ? "h-6 px-1.5 text-[11px]" : "h-8 text-[16px] sm:text-xs"
      )}
      aria-label="Move"
      title="Move"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {dayTargets.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
      <option value="__sep" disabled>
        ──────────
      </option>
      {parkingTargets.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

function TaskRow({
  task,
  moveTargets,
  onMove,
  onToggleDone,
  onEdit,
  tone,
  compact,
}: {
  task: Task;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onToggleDone: (id: string, nextDone: boolean) => void;
  onEdit: (t: Task) => void;
  tone?: "normal" | "overdue";
  compact?: boolean;
}) {
  const isDone = task.status === "done";
  const [showMove, setShowMove] = useState(false);

  return (
    <RowShell tone={tone} compact={compact} onEdit={() => onEdit(task)} onTap={() => setShowMove((s) => !s)}>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(task.id, !isDone);
        }}
        className={clsx(
          compact ? "shrink-0 h-4 w-4 rounded border grid place-items-center" : "shrink-0 h-6 w-6 rounded-md border grid place-items-center",
          isDone ? "border-emerald-400/70 bg-emerald-300 text-neutral-900" : "border-neutral-700 bg-neutral-950 text-neutral-200"
        )}
        aria-label={isDone ? "Mark not done" : "Mark done"}
        title={isDone ? "Mark not done" : "Mark done"}
      >
        {isDone ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={clsx(
            "truncate",
            compact ? "text-[11px]" : "text-sm",
            isDone ? "text-emerald-300" : "text-neutral-200"
          )}
        >
          {task.title}
        </div>
      </div>

      {showMove && (
        <MoveSelect compact={compact} value={locationValueFor(task)} onChange={(v) => onMove(task.id, v)} moveTargets={moveTargets} />
      )}
    </RowShell>
  );
}

function PlanRow({
  plan,
  moveTargets,
  onMove,
  onEdit,
  compact,
}: {
  plan: Plan;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onEdit: (p: Plan) => void;
  compact?: boolean;
}) {
  const [showMove, setShowMove] = useState(false);
  return (
    <RowShell compact={compact} onEdit={() => onEdit(plan)} onTap={() => setShowMove((s) => !s)}>
      <div className="min-w-0 flex-1">
        <div className={clsx("truncate", compact ? "text-[11px]" : "text-sm")}>
          {plan.title}
          <TimePill startsAt={plan.starts_at} endsAt={plan.ends_at} />
        </div>
      </div>

      {showMove && (
        <MoveSelect compact={compact} value={locationValueFor(plan)} onChange={(v) => onMove(plan.id, v)} moveTargets={moveTargets} />
      )}
    </RowShell>
  );
}

function FocusRow({
  focus,
  moveTargets,
  onMove,
  onEdit,
  compact,
}: {
  focus: Focus;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onEdit: (f: Focus) => void;
  compact?: boolean;
}) {
  const [showMove, setShowMove] = useState(false);
  return (
    <RowShell compact={compact} onEdit={() => onEdit(focus)} onTap={() => setShowMove((s) => !s)}>
      <div className="min-w-0 flex-1">
        <div className={clsx("truncate", compact ? "text-[11px]" : "text-sm")}>{focus.title}</div>
      </div>

      {showMove && (
        <MoveSelect compact={compact} value={locationValueFor(focus)} onChange={(v) => onMove(focus.id, v)} moveTargets={moveTargets} />
      )}
    </RowShell>
  );
}

function FocusFloat({
  focus,
  moveTargets,
  onMove,
  onEdit,
}: {
  focus: Focus;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onEdit: (f: Focus) => void;
}) {
  const [showMove, setShowMove] = useState(false);

  return (
    <RowShell onEdit={() => onEdit(focus)} onTap={() => setShowMove((s) => !s)}>
      <div className="min-w-0 flex-1 truncate text-sm text-neutral-200">{focus.title}</div>
      {showMove && (
        <div className="opacity-80">
          <MoveSelect value={locationValueFor(focus)} onChange={(v) => onMove(focus.id, v)} moveTargets={moveTargets} />
        </div>
      )}
    </RowShell>
  );
}

// --- FocusLine and FocusBand for Focus band display in day cards ---
function FocusLine({
  focus,
  moveTargets,
  onMove,
  onEdit,
  compact,
}: {
  focus: Focus;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onEdit: (f: Focus) => void;
  compact?: boolean;
}) {
  const [showMove, setShowMove] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("button,select,input,textarea,a,label"));
  };

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    // Long-press edit ONLY on touch. Desktop uses right-click.
    if (e.pointerType !== "touch") return;
    if (isInteractiveTarget(e.target)) return;

    clear();
    startRef.current = { x: e.clientX, y: e.clientY };

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startRef.current = null;
      onEdit(focus);
    }, 650);
  };

  const maybeCancelOnMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    if (!timerRef.current) return;
    if (!startRef.current) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 10 * 10) {
      clear();
    }
  };

  return (
    <div
      className={clsx(
        "flex items-start rounded-lg hover:bg-neutral-950/30",
        compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2"
      )}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setShowMove((s) => !s);
      }}
      onPointerDown={start}
      onPointerMove={maybeCancelOnMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(focus);
      }}
      style={{ touchAction: "manipulation" }}
    >
      <div className={clsx("min-w-0 flex-1 italic text-neutral-200/90", compact ? "text-xs" : "text-sm")}>
        <div className="truncate">{focus.title}</div>
      </div>
      {showMove && (
        <div className="shrink-0 opacity-85">
          <MoveSelect compact={compact} value={locationValueFor(focus)} onChange={(v) => onMove(focus.id, v)} moveTargets={moveTargets} />
        </div>
      )}
    </div>
  );
}

function FocusBand({
  items,
  moveTargets,
  onMove,
  onEdit,
  compact,
}: {
  items: Focus[];
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onEdit: (f: Focus) => void;
  compact?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className={clsx(compact ? "mt-2" : "mt-3", "overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/25")}>
      <div className="divide-y divide-neutral-800/60">
        {items.map((f) => (
          <FocusLine
            key={f.id}
            focus={f}
            moveTargets={moveTargets}
            onMove={onMove}
            onEdit={onEdit}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
// --- PlanLine and PlanBand for italic Plan band display in day cards ---
function PlanLine({
  plan,
  moveTargets,
  onMove,
  onEdit,
  compact,
}: {
  plan: Plan;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onEdit: (p: Plan) => void;
  compact?: boolean;
}) {
  const [showMove, setShowMove] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("button,select,input,textarea,a,label"));
  };

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    // Long-press edit ONLY on touch. Desktop uses right-click.
    if (e.pointerType !== "touch") return;
    if (isInteractiveTarget(e.target)) return;

    clear();
    startRef.current = { x: e.clientX, y: e.clientY };

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startRef.current = null;
      onEdit(plan);
    }, 650);
  };

  const maybeCancelOnMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    if (!timerRef.current) return;
    if (!startRef.current) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 10 * 10) {
      clear();
    }
  };

  return (
    <div
      className={clsx(
        "flex items-start rounded-lg hover:bg-neutral-950/30",
        compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2"
      )}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setShowMove((s) => !s);
      }}
      onPointerDown={start}
      onPointerMove={maybeCancelOnMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit(plan);
      }}
      style={{ touchAction: "manipulation" }}
    >
      <div className={clsx("min-w-0 flex-1 italic text-neutral-200/90", compact ? "text-xs" : "text-sm")}>
        <div className="truncate">
          {plan.title}
          <TimePill startsAt={plan.starts_at} endsAt={plan.ends_at} />
        </div>
      </div>

      {showMove && (
        <div className="shrink-0 opacity-85">
          <MoveSelect
            compact={compact}
            value={locationValueFor(plan)}
            onChange={(v) => onMove(plan.id, v)}
            moveTargets={moveTargets}
          />
        </div>
      )}
    </div>
  );
}

function PlanBand({
  items,
  moveTargets,
  onMove,
  onEdit,
  compact,
}: {
  items: Plan[];
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onEdit: (p: Plan) => void;
  compact?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className={clsx(compact ? "mt-2" : "mt-3")}>
      <div className={clsx(compact ? "space-y-0.5" : "space-y-1")}>
        {items.map((p) => (
          <PlanLine
            key={p.id}
            plan={p}
            moveTargets={moveTargets}
            onMove={onMove}
            onEdit={onEdit}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
function EditSheet({
  open,
  item,
  itemType,
  onClose,
  moveTargets,
  projectGoals,
  onSave,
  onDelete,
  onArchiveFocus,
}: {
  open: boolean;
  item: Task | Plan | Focus | null;
  itemType: ItemType;
  onClose: () => void;
  moveTargets: MoveTarget[];
  projectGoals: ProjectGoal[];
  onSave: (patch: {
    itemType: ItemType;
    title: string;
    notes: string | null;
    targetValue: string;
    planStartTime?: string;
    planEndDate?: string;
    projectGoalId?: string;
  }) => void;
  onDelete: () => void;
  onArchiveFocus: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [targetValue, setTargetValue] = useState<string>("none");
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndDate, setPlanEndDate] = useState("");
  const [localType, setLocalType] = useState<ItemType>("task");
  const [projectGoalId, setProjectGoalId] = useState("");
  // Date picker state for custom date
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    setTitle((item as any).title ?? "");
    setNotes(((item as any).notes ?? "") as string);
    setTargetValue(locationValueFor(item as any));
    setLocalType(itemType);
    setProjectGoalId((item as any).project_goal_id ?? "");
    if (itemType === "plan") {
      const p = item as Plan;
      setPlanStartTime(isoToTimeInput(p.starts_at));
      setPlanEndDate(p.end_date ?? "");
    } else {
      setPlanStartTime("");
      setPlanEndDate("");
    }
    // Custom date logic
    let initialDate = "";
    if (locationValueFor(item as any).startsWith("D|")) {
      initialDate = locationValueFor(item as any).split("|")[1];
    } else {
      // Default to today
      initialDate = toISODate(new Date());
    }
    setCustomDate(initialDate);
    setShowDatePicker(false);
  }, [open, item, itemType]);

  const dayTargets = moveTargets.filter((t) => t.group === "days");
  const parkingTargets = moveTargets.filter((t) => t.group === "parking");
  const isDayTarget = targetValue.startsWith("D|");

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />

      <div className="absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 mx-auto max-w-xl px-2">
        <div className="max-h-[calc(100dvh-140px)] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Edit</div>
            <button
              onClick={() =>
                onSave({
                  itemType: localType,
                  title: title.trim(),
                  notes: notes.trim() ? notes.trim() : null,
                  targetValue,
                  planStartTime,
                  planEndDate,
                  projectGoalId: projectGoalId || "",
                })
              }
              className="rounded-lg border border-neutral-800 bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-900 active:scale-[0.99]"
            >
              Save
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Type</div>
              <div className="flex gap-2">
                {([
                  ["task", "Task"],
                  ["plan", "Plan"],
                  ["focus", "Intention"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => setLocalType(k as ItemType)}
                    className={clsx(
                      "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold",
                      localType === k
                        ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                        : "border-neutral-800 bg-neutral-900 text-neutral-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Title</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm"
                autoFocus
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">When</div>
              <select
                value={targetValue}
                onChange={(e) => {
                  if (e.target.value === "__custom_date__") {
                    setShowDatePicker(true);
                    setTargetValue(`D|${customDate}`);
                  } else {
                    setShowDatePicker(false);
                    setTargetValue(e.target.value);
                  }
                }}
                className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
              >
                {dayTargets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="__sep" disabled>
                  ──────────
                </option>
                {parkingTargets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="__custom_date__">Pick a date…</option>
              </select>
              {showDatePicker && (
                <div className="mt-2">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomDate(v);
                      setTargetValue(v ? `D|${v}` : "none");
                    }}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Project/Goal (optional)</div>
              <select
                value={projectGoalId}
                onChange={(e) => setProjectGoalId(e.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
              >
                <option value="">None</option>
                {projectGoals.map((pg) => (
                  <option key={pg.id} value={pg.id}>
                    {pg.bucket ? `${pg.bucket}: ${pg.goal}` : pg.goal}
                  </option>
                ))}
              </select>
            </div>

            {localType === "plan" && isDayTarget && (
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Start (optional)</div>
                  <input
                    type="time"
                    value={planStartTime}
                    onChange={(e) => setPlanStartTime(e.target.value)}
                    className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs text-neutral-400">End date</div>
                  <input
                    type="date"
                    value={planEndDate}
                    min={targetValue.startsWith("D|") ? targetValue.split("|")[1] : undefined}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                    className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs text-neutral-400">Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[92px] w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-100 active:scale-[0.99]"
              >
                Cancel
              </button>
              {itemType === "focus" ? (
                <button
                  onClick={onArchiveFocus}
                  className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-100"
                >
                  Archive
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (confirm("Delete this item?")) onDelete();
                  }}
                  className="flex-1 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-2 text-sm font-semibold text-red-200"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddSheet({
  open,
  onClose,
  onCreate,
  moveTargets,
  defaultTarget,
  projectGoals,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (args: {
  titleRaw: string;
  notes: string;
  targetValue: string;
  itemType: ItemType;
  planStartTime: string;
  planEndDate: string;
  planDayOff: boolean;
  projectGoalId: string;
}) => void;
  moveTargets: MoveTarget[];
  defaultTarget: string;
  projectGoals: ProjectGoal[];
}) {
  const [itemType, setItemType] = useState<ItemType>("task");
  const [titleRaw, setTitleRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [targetValue, setTargetValue] = useState(defaultTarget);
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndDate, setPlanEndDate] = useState("");
  const [planDayOff, setPlanDayOff] = useState(false);
  const [projectGoalId, setProjectGoalId] = useState("");
  // Date picker state for custom date
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemType("task");
    setTitleRaw("");
    setNotes("");
    setTargetValue(defaultTarget);
    setPlanStartTime("");
    setPlanEndDate("");
    setPlanDayOff(false);
    setProjectGoalId("");
    // Date picker: set to today or to defaultTarget if D|
    let initialDate = "";
    if (defaultTarget.startsWith("D|")) {
      initialDate = defaultTarget.split("|")[1];
    } else {
      initialDate = toISODate(new Date());
    }
    setCustomDate(initialDate);
    setShowDatePicker(false);
  }, [open, defaultTarget]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        onCreate({ titleRaw, notes, targetValue, itemType, planStartTime, planEndDate, planDayOff, projectGoalId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onCreate, titleRaw, notes, targetValue, itemType, planStartTime, planEndDate]);

  const dayTargets = moveTargets.filter((t) => t.group === "days");
  const parkingTargets = moveTargets.filter((t) => t.group === "parking");
  const isDayTarget = targetValue.startsWith("D|");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />

      <div className="absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 mx-auto max-w-xl px-2">
  <div className="max-h-[calc(100dvh-140px)] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Add</div>
            <button
              onClick={() => {
                if (!titleRaw.trim()) return;
                onCreate({ titleRaw, notes, targetValue, itemType, planStartTime, planEndDate, planDayOff, projectGoalId });
                onClose();
              }}
              className="rounded-lg border border-neutral-800 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-900 active:scale-[0.99]"
            >
              Add
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Type</div>
              <div className="flex gap-2">
                {([
                  ["task", "Task"],
                  ["plan", "Plan"],
                  ["focus", "Intention"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setItemType(k)}
                    className={clsx(
                      "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold",
                      itemType === k
                        ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                        : "border-neutral-800 bg-neutral-900 text-neutral-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Title</div>
              <input
                value={titleRaw}
                onChange={(e) => setTitleRaw(e.target.value)}
                placeholder="Add..."
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 placeholder:text-neutral-500 outline-none sm:text-sm"
                autoFocus
              />
              <div className="mt-1 text-[11px] text-neutral-500">
                Hashtags: #today #tomorrow #mon…#sun #thisweek #thisweekend #nextweek #nextweekend #nodate
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">When</div>
              <select
                value={targetValue}
                onChange={(e) => {
                  if (e.target.value === "__custom_date__") {
                    setShowDatePicker(true);
                    setTargetValue(`D|${customDate}`);
                  } else {
                    setShowDatePicker(false);
                    setTargetValue(e.target.value);
                  }
                }}
                className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
              >
                {dayTargets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="__sep" disabled>
                  ──────────
                </option>
                {parkingTargets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="__custom_date__">Pick a date…</option>
              </select>
              {showDatePicker && (
                <div className="mt-2 space-y-2">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomDate(v);
                      setTargetValue(v ? `D|${v}` : "none");
                      // If end date is before start date, clear it.
                      if (planEndDate && v && planEndDate < v) setPlanEndDate("");
                    }}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm"
                  />

                  {itemType === "plan" && (
                    <input
                      type="date"
                      value={planEndDate}
                      min={customDate || undefined}
                      onChange={(e) => setPlanEndDate(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm"
                    />
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Project/Goal (optional)</div>
              <select
                value={projectGoalId}
                onChange={(e) => setProjectGoalId(e.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
              >
                <option value="">None</option>
                {projectGoals.map((pg) => (
                  <option key={pg.id} value={pg.id}>
                    {pg.bucket ? `${pg.bucket}: ${pg.goal}` : pg.goal}
                  </option>
                ))}
              </select>
            </div>

            {itemType === "plan" && isDayTarget && (
  <div className="grid grid-cols-1 gap-2">
    <div>
      <div className="mb-1 text-xs text-neutral-400">Start (optional)</div>
      <input
        type="time"
        value={planStartTime}
        onChange={(e) => setPlanStartTime(e.target.value)}
        className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
      />
    </div>

    <label className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100">
      <span className="text-[13px] text-neutral-200">Day off?</span>
      <input
        type="checkbox"
        checked={planDayOff}
        onChange={(e) => setPlanDayOff(e.target.checked)}
        className="h-5 w-5 accent-neutral-100"
      />
    </label>
  </div>
)}

            <div>
              <div className="mb-1 text-xs text-neutral-400">Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="min-h-[92px] w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 placeholder:text-neutral-500 outline-none sm:text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!titleRaw.trim()) return;
                  onCreate({ titleRaw, notes, targetValue, itemType, planStartTime, planEndDate, planDayOff, projectGoalId });
                  onClose();
                }}
                className="flex-1 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
              >
                Add
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-100 active:scale-[0.99]"
              >
                Cancel
              </button>
            </div>

            <div className="text-[11px] text-neutral-500">Tip: Cmd/Ctrl+Enter to add. Escape to close.</div>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitDoneIds, setHabitDoneIds] = useState<Set<string>>(new Set());
  const [gymDoneToday, setGymDoneToday] = useState(false);
  const [trichLoggedToday, setTrichLoggedToday] = useState<boolean | null>(null);
  const [projectGoals, setProjectGoals] = useState<ProjectGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [draftByDay, setDraftByDay] = useState<Record<string, Record<ItemType, string>>>({});
  const [draftTypeByDay, setDraftTypeByDay] = useState<Record<string, ItemType>>({});

  const PARKING_TAB_KEY = "planner.parkingTab";
  const PARKING_OPEN_KEY = "planner.parkingOpen";

  const CONTENT_TAB_KEY = "planner.contentTab";
  const CONTENT_OPEN_KEY = "planner.contentOpen";

  const [contentTab, setContentTab] = useState<ContentTab>(() => {
    if (typeof window === "undefined") return "cook";
    const raw = window.localStorage.getItem(CONTENT_TAB_KEY);
    const allowed: ContentTab[] = ["cook", "watch", "movies", "listen", "city", "read"];
    return allowed.includes(raw as ContentTab) ? (raw as ContentTab) : "cook";
  });
const [movieItems, setMovieItems] = useState<MovieTrackerItem[]>([]);
const [watchingMovieId, setWatchingMovieId] = useState<string | null>(null);
const [watchedDate, setWatchedDate] = useState<string>("");
const [watchedNote, setWatchedNote] = useState<string>("");
const [movieDropdownId, setMovieDropdownId] = useState<string | null>(null);

  const [contentOpen, setContentOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(CONTENT_OPEN_KEY);
    if (raw === null) return true;
    return raw === "1";
  });

  const CONTENT_ITEMS_KEY_PREFIX = "planner.content.items.";

  const [contentItemsByTab, setContentItemsByTab] = useState<Record<ContentTab, ContentItem[]>>(() => {
    if (typeof window === "undefined") {
      return { cook: [], watch: [], movies: [], listen: [], read: [], city: [] };
    }
    const tabs: ContentTab[] = ["cook", "watch", "movies", "listen", "read", "city"];
    const out: Record<ContentTab, ContentItem[]> = { cook: [], watch: [], movies: [], listen: [], read: [], city: [] };
    for (const t of tabs) {
      try {
        const raw = window.localStorage.getItem(`${CONTENT_ITEMS_KEY_PREFIX}${t}`);
        out[t] = raw ? (JSON.parse(raw) as ContentItem[]) : [];
      } catch {
        out[t] = [];
      }
    }
    return out;
  });

  const [contentDraft, setContentDraft] = useState("");

  const contentFocusesByTab = useMemo(() => {
  const out: Record<ContentTab, Focus[]> = {
    cook: [],
    watch: [],
    listen: [],
    read: [],
    movies: [],
    city: [],
  };

  for (const f of focuses) {

    
    
    const cat = (f as any).content_category as ContentTab | null | undefined;
    
    if (!cat) continue;
    if (cat === "movies") continue; // movies comes from movie_tracker
    if (f.scheduled_for) continue;  // only items not placed on a day
    if (f.window_kind || f.window_start) continue; // only truly unplaced
    if (out[cat]) out[cat].push(f);
  }

  (["cook", "watch", "listen", "read", "city"] as ContentTab[]).forEach((k) => {
    out[k].sort((a, b) => b.created_at.localeCompare(a.created_at)); // newest first
  });

  return out;
}, [focuses]);


  function handleContentTabClick(next: ContentTab) {
    // Tap the active tab => toggle open/closed
    // Tap a different tab => switch tab and force open
    if (next === contentTab) {
      setContentOpen((o) => !o);
      return;
    }
    setContentTab(next);
    setContentOpen(true);
  }

  const [drawerWindow, setDrawerWindow] = useState<DrawerWindow>(() => {
    if (typeof window === "undefined") return "thisWeek";
    const raw = window.localStorage.getItem(PARKING_TAB_KEY);
    const allowed: DrawerWindow[] = ["thisWeek", "thisWeekend", "nextWeek", "nextWeekend", "open"];
    return allowed.includes(raw as DrawerWindow) ? (raw as DrawerWindow) : "thisWeek";
  });

  const [parkingOpen, setParkingOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(PARKING_OPEN_KEY);
    if (raw === null) return true;
    return raw === "1"; // stored as "1" or "0"
  });
  const [drawerDraft, setDrawerDraft] = useState("");
  const [drawerType, setDrawerType] = useState<ItemType>("task");

  const [openDayIso, setOpenDayIso] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editType, setEditType] = useState<ItemType>("task");
  const [editItem, setEditItem] = useState<Task | Plan | Focus | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PARKING_TAB_KEY, drawerWindow);
  }, [drawerWindow]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PARKING_OPEN_KEY, parkingOpen ? "1" : "0");
  }, [parkingOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONTENT_TAB_KEY, contentTab);
  }, [contentTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONTENT_OPEN_KEY, contentOpen ? "1" : "0");
  }, [contentOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tabs: ContentTab[] = ["cook", "watch", "movies", "listen", "read", "city"];
    for (const t of tabs) {
      try {
        window.localStorage.setItem(`${CONTENT_ITEMS_KEY_PREFIX}${t}`, JSON.stringify(contentItemsByTab[t] ?? []));
      } catch {
        // ignore storage errors
      }
    }
  }, [contentItemsByTab]);

  // Responsive flag for md (768px+) and up
  const [isMdUp, setIsMdUp] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsMdUp(mql.matches);
    apply();
    if ("addEventListener" in mql) {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
    // Safari fallback
    // @ts-ignore
    mql.addListener(apply);
    // @ts-ignore
    return () => mql.removeListener(apply);
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, [today]);

  const windows = useMemo(() => computePlanningWindows(days[0]), [days]);

  const moveTargets = useMemo<MoveTarget[]>(() => {
    const dayTargets: MoveTarget[] = days.map((d, idx) => ({
      label: fmtDayLabel(d, idx),
      value: `D|${toISODate(d)}`,
      group: "days",
    }));

    const parkingTargets: MoveTarget[] = [
      { label: "This Week", value: `P|workweek|${windows.thisWeekStart}`, group: "parking" },
      { label: "This Weekend", value: `P|weekend|${windows.thisWeekendStart}`, group: "parking" },
      { label: "Next Week", value: `P|workweek|${windows.nextWeekStart}`, group: "parking" },
      { label: "Next Weekend", value: `P|weekend|${windows.nextWeekendStart}`, group: "parking" },
      { label: "Open", value: "none", group: "parking" },
      
    ];

    
    return [...dayTargets, ...parkingTargets];
  }, [days, windows]);

function getWindowValue(which: DrawerWindow) {
  if (which === "open") return "none";
    if (which === "thisWeek") return `P|workweek|${windows.thisWeekStart}`;
    if (which === "thisWeekend") return `P|weekend|${windows.thisWeekendStart}`;
    if (which === "nextWeek") return `P|workweek|${windows.nextWeekStart}`;
    return `P|weekend|${windows.nextWeekendStart}`;
  }


  async function fetchAll() {
    setLoading(true);

    // Auth guard: if session is missing, bounce to /login and stop.
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();

    if (sessionErr) {
      console.warn("auth getSession (fetchAll)", sessionErr);
    }

    
    if (!session) {
      setAuthReady(false);
      setAuthChecked(true);
      setLoading(false);
      router.replace("/login");
      return;
    }

    const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone
    const start = toISODate(days[0]);

    // We normally show 7 days (today + next 6). But we ALSO want future-dated items that fall into
    // This Week / This Weekend / Next Week / Next Weekend to appear in the Parking Lot tabs.
    // So we extend the fetch horizon to at least the end of next weekend.
    const thisWeekEnd = toISODate(addDays(fromISODate(windows.thisWeekStart), 4));
    const nextWeekEnd = toISODate(addDays(fromISODate(windows.nextWeekStart), 4));
    const thisWeekendEnd = toISODate(addDays(fromISODate(windows.thisWeekendStart), 1));
    const nextWeekendEnd = toISODate(addDays(fromISODate(windows.nextWeekendStart), 1));

    const endCandidates = [
      days[6],
      fromISODate(thisWeekEnd),
      fromISODate(nextWeekEnd),
      fromISODate(thisWeekendEnd),
      fromISODate(nextWeekendEnd),
    ];
    const maxEnd = endCandidates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
    const end = toISODate(maxEnd);

    const parkingOr = [
      `and(window_kind.eq.workweek,window_start.eq.${windows.thisWeekStart})`,
      `and(window_kind.eq.weekend,window_start.eq.${windows.thisWeekendStart})`,
      `and(window_kind.eq.workweek,window_start.eq.${windows.nextWeekStart})`,
      `and(window_kind.eq.weekend,window_start.eq.${windows.nextWeekendStart})`,
    ].join(",");

    const [
      tasksScheduledRes,
      tasksOverdueRes,
      tasksParkingRes,
      plansScheduledRes,
      plansParkingRes,
      focusesScheduledRes,
      focusesParkingRes,
      habitsRes,
      habitLogsTodayRes,
      workoutSessionsTodayRes,
      trichEventsTodayRes,
      movieTrackerRes,
      projectGoalsRes,
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
        .in("status", ["open", "done"])
        .not("scheduled_for", "is", null)
        .gte("scheduled_for", start)
        .lte("scheduled_for", end)
        .order("scheduled_for", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("tasks")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
        .eq("status", "open")
        .not("scheduled_for", "is", null)
        .lt("scheduled_for", start)
        .order("scheduled_for", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("tasks")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
        .eq("status", "open")
        .is("scheduled_for", null)
        .or(`${parkingOr},and(window_kind.is.null,window_start.is.null)`)
        .order("created_at", { ascending: true }),

      supabase
        .from("plans")
        .select("id,title,notes,starts_at,ends_at,end_date,day_off,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
        .eq("status", "open")
        .not("scheduled_for", "is", null)
         .or(`and(scheduled_for.gte.${start},scheduled_for.lte.${end}),and(scheduled_for.lt.${start},end_date.gte.${start})`)
        .order("scheduled_for", { ascending: true })
        .order("starts_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("plans")
        .select("id,title,notes,starts_at,ends_at,end_date,day_off,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
        .eq("status", "open")
        .is("scheduled_for", null)
        .or(`${parkingOr},and(window_kind.is.null,window_start.is.null)`)
        .order("created_at", { ascending: true }),

      supabase
        .from("focuses")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,content_category,project_goal_id,created_at")
        .eq("status", "active")
        .not("scheduled_for", "is", null)
        .gte("scheduled_for", start)
        .lte("scheduled_for", end)
        .order("scheduled_for", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("focuses")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,content_category,project_goal_id,created_at")
        .eq("status", "active")
        .is("scheduled_for", null)
        .or(`${parkingOr},and(window_kind.is.null,window_start.is.null)`)
        .order("created_at", { ascending: true }),

      supabase
        .from("habits")
        .select("id,name,short_label,is_active,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),

      supabase
        .from("habit_logs")
        .select("habit_id,done_on")
        .eq("done_on", todayIso),
      supabase
        .from("workout_sessions")
        .select("id")
        .eq("performed_on", todayIso)
        .limit(1),
      supabase
        .from("trich_events")
        .select("id")
        .eq("occurred_on", todayIso)
        .limit(1),
        supabase
  .from("movie_tracker")
  .select("id,title,priority")
  .not("priority", "is", null)
  .neq("priority", 99)
  .order("priority", { ascending: true })
  .order("title", { ascending: true }),
      supabase
        .from("projects_goals")
        .select("id,goal,bucket,archived,created_at")
        .eq("archived", false)
        .order("sort_order", { ascending: true })
        .order("goal", { ascending: true }),
    ]);

    if (tasksScheduledRes.error) console.warn("tasksScheduledRes", tasksScheduledRes.error);
    if (tasksOverdueRes.error) console.warn("tasksOverdueRes", tasksOverdueRes.error);
    if (tasksParkingRes.error) console.warn("tasksParkingRes", tasksParkingRes.error);
    if (plansScheduledRes.error) console.warn("plansScheduledRes", plansScheduledRes.error);
    if (plansParkingRes.error) console.warn("plansParkingRes", plansParkingRes.error);
    if (focusesScheduledRes.error) console.warn("focusesScheduledRes", focusesScheduledRes.error);
    if (focusesParkingRes.error) console.warn("focusesParkingRes", focusesParkingRes.error);
    if (habitsRes.error) console.warn("habitsRes", habitsRes.error);
    if (habitLogsTodayRes.error) console.warn("habitLogsTodayRes", habitLogsTodayRes.error);
    if (workoutSessionsTodayRes.error) console.warn("workoutSessionsTodayRes", workoutSessionsTodayRes.error);
    if (trichEventsTodayRes.error) console.warn("trichEventsTodayRes", trichEventsTodayRes.error);
    if (movieTrackerRes.error) console.warn("movieTrackerRes", movieTrackerRes.error);
    if (projectGoalsRes.error) console.warn("projectGoalsRes", projectGoalsRes.error);
    setTasks([
      ...((tasksOverdueRes.data ?? []) as Task[]),
      ...((tasksScheduledRes.data ?? []) as Task[]),
      ...((tasksParkingRes.data ?? []) as Task[]),
    ]);

    setPlans([
      ...((plansScheduledRes.data ?? []) as Plan[]),
      ...((plansParkingRes.data ?? []) as Plan[]),
    ]);

    setFocuses([
      ...((focusesScheduledRes.data ?? []) as Focus[]),
      ...((focusesParkingRes.data ?? []) as Focus[]),
    ]);

    setProjectGoals((projectGoalsRes.data ?? []) as ProjectGoal[]);

    let habitsData = (habitsRes.data ?? []) as any[];
    if (habitsRes.error) {
      // Fallback: try a minimal select in case the schema is missing newer columns (e.g., short_label)
      const alt = await supabase
        .from("habits")
        .select("id,name,short_label,is_active,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (!alt.error) habitsData = (alt.data ?? []) as any[];
      else console.warn("habitsRes fallback", alt.error);
    }

    // If short_label was not returned (or is null), try to hydrate it with a lightweight follow-up query.
    // This prevents the Today chips from falling back to the first 3 letters of the name.
    const needsShortLabel = habitsData.some((h) => !(h?.short_label && String(h.short_label).trim()));
    if (needsShortLabel) {
      const labelsRes = await supabase
        .from("habits")
        .select("id,short_label")
        .eq("is_active", true);

      if (!labelsRes.error && labelsRes.data) {
        const labelById = new Map<string, string | null>(
          (labelsRes.data as any[]).map((r) => [String(r.id), (r.short_label ?? null) as string | null])
        );

        habitsData = habitsData.map((h) => {
          const current = h?.short_label && String(h.short_label).trim() ? String(h.short_label) : null;
          const hydrated = labelById.get(String(h.id)) ?? null;
          return { ...h, short_label: current ?? hydrated };
        });
      } else if (labelsRes.error) {
        console.warn("habits short_label hydration", labelsRes.error);
      }
    }

    setHabits(habitsData as Habit[]);

    const doneRows = (habitLogsTodayRes.error ? [] : (habitLogsTodayRes.data ?? [])) as HabitLog[];
    const doneSet = new Set<string>(doneRows.map((r) => r.habit_id));
    setHabitDoneIds(doneSet);
    const gymDone = !workoutSessionsTodayRes.error && ((workoutSessionsTodayRes.data ?? []) as any[]).length > 0;
    setGymDoneToday(gymDone);
    if (trichEventsTodayRes.error) {
      setTrichLoggedToday(null);
    } else {
      const trichLogged = ((trichEventsTodayRes.data ?? []) as any[]).length > 0;
      setTrichLoggedToday(trichLogged);
    }
    const movies = (movieTrackerRes.error ? [] : (movieTrackerRes.data ?? [])) as any[];
setMovieItems(
  movies.map((m) => ({
    id: String(m.id),
    title: String(m.title ?? ""),
    priority: (m.priority ?? null) as number | null,
  }))
);

    setLoading(false);
  }
  async function toggleHabitDone(habitId: string) {
    const todayIso = toISODate(days[0]);
    const isDone = habitDoneIds.has(habitId);

    // Optimistic update
    setHabitDoneIds((prev) => {
      const next = new Set(prev);
      if (isDone) next.delete(habitId);
      else next.add(habitId);
      return next;
    });

    if (isDone) {
      const { error } = await supabase
        .from("habit_logs")
        .delete()
        .eq("habit_id", habitId)
        .eq("done_on", todayIso);
      if (error) {
        console.warn("habit toggle", error);
        // revert
        setHabitDoneIds((prev) => {
          const next = new Set(prev);
          next.add(habitId);
          return next;
        });
      }
      return;
    }

    const { error } = await supabase
      .from("habit_logs")
      .insert({ habit_id: habitId, done_on: todayIso });
    if (error) {
      // If unique constraint hit (already logged), keep UI green.
      // Otherwise revert.
      const code = (error as any)?.code;
      if (code !== "23505") {
        console.warn("habit toggle", error);
        setHabitDoneIds((prev) => {
          const next = new Set(prev);
          next.delete(habitId);
          return next;
        });
      }
    }
  }

  // Movie tracker functions
  function sortMoviesByPriority(list: MovieTrackerItem[]): MovieTrackerItem[] {
    return [...list].sort((a, b) => {
      const ap = a.priority ?? 999999;
      const bp = b.priority ?? 999999;
      if (ap !== bp) return ap - bp;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
  }

  const maxNon99MoviePriority = useMemo(() => {
    let max = -1;
    for (const m of movieItems) {
      if (m.priority === null || m.priority === 99) continue;
      if (m.priority > max) max = m.priority;
    }
    return max;
  }, [movieItems]);

  async function moveMoviePriority(id: string, direction: "up" | "down") {
    const me = movieItems.find((m) => m.id === id);
    if (!me) return;

    const p = me.priority;
    if (p === null) return;

    // bounds for watching
    if (p === 0 && direction === "up") return;

    const target = direction === "up" ? p - 1 : p + 1;

    const sameCount = movieItems.filter((m) => m.priority === p).length;

    // if this movie is the *only* one at the current highest non-99 priority,
    // a single DOWN click should demote it directly to On Deck (99).
    if (direction === "down" && p === maxNon99MoviePriority && sameCount === 1) {
      const newP = 99;

      // optimistic UI update
      setMovieItems((prev) =>
        sortMoviesByPriority(prev.map((m) => (m.id === id ? { ...m, priority: newP } : m)))
      );

      const { error } = await supabase
        .from("movie_tracker")
        .update({ priority: newP })
        .eq("id", id);

      if (error) {
        alert(`Move failed: ${error.message}`);
        await fetchAll();
      }
      return;
    }

    const targetCount = movieItems.filter((m) => m.priority === target).length;

    // Only swap if BOTH sides are singletons
    const shouldSwap = sameCount === 1 && targetCount === 1 && !(p === 0 && direction === "down");

    if (!shouldSwap) {
      // optimistic UI update
      setMovieItems((prev) =>
        sortMoviesByPriority(prev.map((m) => (m.id === id ? { ...m, priority: target } : m)))
      );

      const { error } = await supabase
        .from("movie_tracker")
        .update({ priority: target })
        .eq("id", id);

      if (error) {
        alert(`Move failed: ${error.message}`);
        await fetchAll();
      }
      return;
    }

    // Swap with the single movie at the target priority
    const targetMovieId = movieItems.find((m) => m.priority === target)?.id;
    if (!targetMovieId) {
      await fetchAll();
      return;
    }

    // optimistic UI update
    setMovieItems((prev) =>
      sortMoviesByPriority(
        prev.map((m) => {
          if (m.id === id) return { ...m, priority: target };
          if (m.id === targetMovieId) return { ...m, priority: p };
          return m;
        })
      )
    );

    try {
      const { error: e1 } = await supabase
        .from("movie_tracker")
        .update({ priority: p })
        .eq("id", targetMovieId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("movie_tracker")
        .update({ priority: target })
        .eq("id", id);
      if (e2) throw e2;
    } catch (e: any) {
      alert(`Move failed: ${e?.message ?? "Unknown error"}`);
      await fetchAll();
    }
  }

  function openWatchedModal(id: string) {
    setWatchingMovieId(id);
    setWatchedDate(toISODate(new Date()));
    setWatchedNote("");
  }

  async function confirmMarkWatched() {
    const movie = movieItems.find((m) => m.id === watchingMovieId);
    if (!movie) {
      setWatchingMovieId(null);
      return;
    }

    const watchedPriority = movie.priority;

    const payload: any = {
      status: "watched",
      date_watched: watchedDate,
      priority: null,
    };

    const { error } = await supabase
      .from("movie_tracker")
      .update(payload)
      .eq("id", movie.id);

    if (error) {
      alert(`Mark watched failed: ${error.message}`);
      return;
    }

    setWatchingMovieId(null);

    // Rebalance priorities
    if (watchedPriority !== null && watchedPriority !== 99) {
      try {
        const { data: affected, error: selErr } = await supabase
          .from("movie_tracker")
          .select("id,priority")
          .eq("status", "to_watch")
          .not("priority", "is", null)
          .neq("priority", 99)
          .gt("priority", watchedPriority);

        if (selErr) throw selErr;

        const updates = (affected ?? []).map((r: any) => {
          const nextP = Math.max(0, (r.priority as number) - 1);
          return supabase.from("movie_tracker").update({ priority: nextP }).eq("id", r.id);
        });

        if (updates.length > 0) {
          const results = await Promise.all(updates);
          const firstErr = results.find((res: any) => res?.error)?.error;
          if (firstErr) throw firstErr;
        }
      } catch (e: any) {
        alert(`Priority rebalance failed: ${e?.message ?? "Unknown error"}`);
      }
    }

    await fetchAll();
  }

  async function scheduleMovieAsIntention(movieId: string, targetValue: string) {
    const movie = movieItems.find((m) => m.id === movieId);
    if (!movie) return;

    // Don't process if "Open" (none) is selected
    if (targetValue === "none") {
      setMovieDropdownId(null);
      return;
    }

    setMovieDropdownId(null);

    // Parse the target value to get the scheduled_for date
    let scheduledFor: string | null = null;

    if (targetValue.startsWith("D|")) {
      // Day target: D|YYYY-MM-DD
      scheduledFor = targetValue.slice(2);
    } else if (targetValue.startsWith("P|week|") || targetValue.startsWith("P|weekend|")) {
      // Parking lot target - use the window start date
      const windowStart = targetValue.split("|")[2];
      scheduledFor = windowStart;
    }

    if (!scheduledFor) {
      alert("Invalid target selected");
      return;
    }

    // Create a focus (intention) with content_category = "movies"
    const payload: any = {
      title: movie.title,
      scheduled_for: scheduledFor,
      content_category: "movies",
      status: "active",
    };

    const { error } = await supabase.from("focuses").insert(payload);

    if (error) {
      alert(`Failed to schedule movie: ${error.message}`);
      return;
    }

    await fetchAll();
  }

  useEffect(() => {
    let unsub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    const init = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.warn("auth getSession", error);
      }
      setAuthChecked(true);

      if (!session) {
        setAuthReady(false);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setAuthReady(true);
      setOpenDayIso(toISODate(days[0]));
      setAuthChecked(true);
      fetchAll();

      unsub = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!nextSession) {
          setAuthReady(false);
          setAuthChecked(true);
          setLoading(false);
          router.replace("/login");
        }
      });
    };

    init();

    return () => {
      try {
        unsub?.data?.subscription?.unsubscribe?.();
      } catch {
        // no-op
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authReady) return;

    const refetchIfVisible = () => {
      if (document.visibilityState === "visible") {
        fetchAll();
      }
    };

    window.addEventListener("focus", refetchIfVisible);
    document.addEventListener("visibilitychange", refetchIfVisible);

    return () => {
      window.removeEventListener("focus", refetchIfVisible);
      document.removeEventListener("visibilitychange", refetchIfVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  const dayRangeStart = useMemo(() => toISODate(days[0]), [days]);

  const overdueTasks = useMemo(() => {
    return tasks.filter((t) => t.status === "open" && t.scheduled_for && t.scheduled_for < dayRangeStart);
  }, [tasks, dayRangeStart]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const d of days) map[toISODate(d)] = [];
    for (const t of tasks) {
      if (!t.scheduled_for) continue;
      if (t.scheduled_for < dayRangeStart) continue;
      if (map[t.scheduled_for]) map[t.scheduled_for].push(t);
    }
    return map;
  }, [tasks, days, dayRangeStart]);

  const plansByDay = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    const dayIsos = days.map((d) => toISODate(d));
    for (const iso of dayIsos) map[iso] = [];

    for (const p of plans) {
  // We render plans on day cards only when they have a scheduled_for date.
  if (!p.scheduled_for) continue;

  const startIso = p.scheduled_for;
  const endIso = p.end_date && p.end_date >= startIso ? p.end_date : startIso;

  // Add this plan to every visible day between start and end (inclusive).
  for (const iso of dayIsos) {
    if (iso < startIso) continue;
    if (iso > endIso) break;
    map[iso].push(p);
  }
}

    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        // Keep timed plans earlier; otherwise keep stable by created_at.
        if (a.starts_at && b.starts_at) return a.starts_at.localeCompare(b.starts_at);
        if (a.starts_at && !b.starts_at) return -1;
        if (!a.starts_at && b.starts_at) return 1;
        return a.created_at.localeCompare(b.created_at);
      });
    }

    return map;
  }, [plans, days]);

  const focusesByDay = useMemo(() => {
    const map: Record<string, Focus[]> = {};
    for (const d of days) map[toISODate(d)] = [];
    for (const f of focuses) {
      if (!f.scheduled_for) continue;
      if (map[f.scheduled_for]) map[f.scheduled_for].push(f);
    }
    return map;
  }, [focuses, days]);

  const drawerLists = useMemo(() => {
    const out = {
      thisWeek: { task: [] as Task[], plan: [] as Plan[], focus: [] as Focus[] },
      thisWeekend: { task: [] as Task[], plan: [] as Plan[], focus: [] as Focus[] },
      nextWeek: { task: [] as Task[], plan: [] as Plan[], focus: [] as Focus[] },
      nextWeekend: { task: [] as Task[], plan: [] as Plan[], focus: [] as Focus[] },
      open: { task: [] as Task[], plan: [] as Plan[], focus: [] as Focus[] },
    };

    const visibleStart = toISODate(days[0]);
    const visibleEnd = toISODate(days[6]);

    const thisWeekEnd = toISODate(addDays(fromISODate(windows.thisWeekStart), 4));
    const nextWeekEnd = toISODate(addDays(fromISODate(windows.nextWeekStart), 4));
    const thisWeekendEnd = toISODate(addDays(fromISODate(windows.thisWeekendStart), 1));
    const nextWeekendEnd = toISODate(addDays(fromISODate(windows.nextWeekendStart), 1));

    const classifyScheduled = (iso: string) => {
      // Workweek windows: Mon–Fri
      if (iso >= windows.thisWeekStart && iso <= thisWeekEnd) return "thisWeek" as const;
      if (iso >= windows.nextWeekStart && iso <= nextWeekEnd) return "nextWeek" as const;
      // Weekend windows: Sat–Sun
      if (iso >= windows.thisWeekendStart && iso <= thisWeekendEnd) return "thisWeekend" as const;
      if (iso >= windows.nextWeekendStart && iso <= nextWeekendEnd) return "nextWeekend" as const;
      return null;
    };

    const matchWindow = (kind: WindowKind | null, start: string | null) => {
      if (!kind || !start) return null;
      if (kind === "workweek" && start === windows.thisWeekStart) return "thisWeek" as const;
      if (kind === "weekend" && start === windows.thisWeekendStart) return "thisWeekend" as const;
      if (kind === "workweek" && start === windows.nextWeekStart) return "nextWeek" as const;
      if (kind === "weekend" && start === windows.nextWeekendStart) return "nextWeekend" as const;
      return null;
    };

    for (const t of tasks) {
      if (t.scheduled_for) {
        // If it's outside the 7-day cards, but within one of the planning windows, show it in that tab.
        if (t.scheduled_for < visibleStart || t.scheduled_for > visibleEnd) {
          const which = classifyScheduled(t.scheduled_for);
          if (which) out[which].task.push(t);
        }
        continue;
      }
      const which = matchWindow(t.window_kind, t.window_start);
      if (which) out[which].task.push(t);
      else if (!t.window_kind && !t.window_start) out.open.task.push(t);
    }
    for (const p of plans) {
      if (p.scheduled_for) {
        if (p.scheduled_for < visibleStart || p.scheduled_for > visibleEnd) {
          const which = classifyScheduled(p.scheduled_for);
          if (which) out[which].plan.push(p);
        }
        continue;
      }
      const which = matchWindow(p.window_kind, p.window_start);
      if (which) out[which].plan.push(p);
      else if (!p.window_kind && !p.window_start) out.open.plan.push(p);
    }
    for (const f of focuses) {
      if (f.scheduled_for) {
        if (f.scheduled_for < visibleStart || f.scheduled_for > visibleEnd) {
          const which = classifyScheduled(f.scheduled_for);
          if (which) out[which].focus.push(f);
        }
        continue;
      }
      const which = matchWindow(f.window_kind, f.window_start);
      if (which) out[which].focus.push(f);
      else if (!f.window_kind && !f.window_start && !(f as any).content_category) out.open.focus.push(f);
    }

    const sortByDate = <T extends { scheduled_for: string | null; created_at: string }>(arr: T[]) => {
      arr.sort((a, b) => {
        const da = a.scheduled_for ?? "9999-12-31";
        const db = b.scheduled_for ?? "9999-12-31";
        if (da !== db) return da.localeCompare(db);
        return a.created_at.localeCompare(b.created_at);
      });
    };

    sortByDate(out.thisWeek.task);
    sortByDate(out.thisWeek.plan);
    sortByDate(out.thisWeek.focus);
    sortByDate(out.thisWeekend.task);
    sortByDate(out.thisWeekend.plan);
    sortByDate(out.thisWeekend.focus);
    sortByDate(out.nextWeek.task);
    sortByDate(out.nextWeek.plan);
    sortByDate(out.nextWeek.focus);
    sortByDate(out.nextWeekend.task);
    sortByDate(out.nextWeekend.plan);
    sortByDate(out.nextWeekend.focus);

    return out;
  }, [tasks, plans, focuses, windows, days]);


  function ensureDayDraft(iso: string) {
    setDraftByDay((prev) => (prev[iso] ? prev : { ...prev, [iso]: { task: "", plan: "", focus: "" } }));
    setDraftTypeByDay((prev) => ({ ...prev, [iso]: prev[iso] ?? "task" }));
  }

  async function createItem(args: {
    titleRaw: string;
    notes: string;
    targetValue: string;
    itemType: ItemType;
    planStartTime?: string;
    planEndDate?: string;
    planDayOff?: boolean;
    projectGoalId?: string;
  }) {
    const parsed = parseHashtags(args.titleRaw, { targetValue: args.targetValue, today, windows, itemType: args.itemType });
    const title = parsed.title.trim();
    if (!title) return;

    let placement: { scheduled_for: string | null; window_kind: WindowKind | null; window_start: string | null };

    if (parsed.targetValue === "none") placement = { scheduled_for: null, window_kind: null, window_start: null };
    else if (parsed.targetValue.startsWith("D|")) placement = { scheduled_for: parsed.targetValue.split("|")[1], window_kind: null, window_start: null };
    else if (parsed.targetValue.startsWith("P|")) {
      const [, kind, start] = parsed.targetValue.split("|");
      placement = { scheduled_for: null, window_kind: kind as WindowKind, window_start: start };
    } else placement = { scheduled_for: null, window_kind: null, window_start: null };

    const notesVal = args.notes.trim() ? args.notes.trim() : null;

    if (parsed.itemType === "task") {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ title, notes: notesVal, status: "open", project_goal_id: args.projectGoalId || null, ...placement })
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
        .single();
      if (error) return console.error(error);
      if (data) setTasks((p) => [...p, data as Task]);
      return;
    }

    if (parsed.itemType === "focus") {
      const { data, error } = await supabase
        .from("focuses")
        .insert({ title, notes: notesVal, status: "active", project_goal_id: args.projectGoalId || null, ...placement })
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,content_category,project_goal_id,created_at")
        .single();
      if (error) return console.error(error);
      if (data) setFocuses((p) => [...p, data as Focus]);
      return;
    }

    // plan
    let starts_at: string | null = null;
    if (placement.scheduled_for && args.planStartTime) {
      starts_at = new Date(`${placement.scheduled_for}T${args.planStartTime}:00`).toISOString();
    }

    // Optional multi-day end date (date-only)
let end_date: string | null = null;
if (args.planEndDate && args.planEndDate.trim()) {
  const endIso = args.planEndDate.trim();
  // Guard: if we have a start day, ignore end dates earlier than start.
  if (!placement.scheduled_for || endIso >= placement.scheduled_for) {
    end_date = endIso;
  }
}

const { data, error } = await supabase
  .from("plans")
  .insert({
    title,
    notes: notesVal,
    status: "open",
    day_off: Boolean(args.planDayOff),
    starts_at,
    end_date,
    project_goal_id: args.projectGoalId || null,
    ...placement
  })
  .select("id,title,notes,starts_at,ends_at,end_date,day_off,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
  .single();
    if (error) return console.error(error);
    if (data) setPlans((p) => [...p, data as Plan]);
  }

  async function moveItem(type: ItemType, id: string, targetValue: string) {
    if (targetValue === "__sep") return;

    let placement: { scheduled_for: string | null; window_kind: WindowKind | null; window_start: string | null };

    if (targetValue === "none") placement = { scheduled_for: null, window_kind: null, window_start: null };
    else if (targetValue.startsWith("D|")) placement = { scheduled_for: targetValue.split("|")[1], window_kind: null, window_start: null };
    else if (targetValue.startsWith("P|")) {
      const [, kind, start] = targetValue.split("|");
      placement = { scheduled_for: null, window_kind: kind as WindowKind, window_start: start };
    } else placement = { scheduled_for: null, window_kind: null, window_start: null };

    const table = type === "task" ? "tasks" : type === "plan" ? "plans" : "focuses";
    const { error } = await supabase.from(table).update(placement).eq("id", id);
    if (error) return console.error(error);

    if (type === "task") setTasks((p) => p.map((t) => (t.id === id ? ({ ...t, ...placement } as Task) : t)));
    if (type === "plan") setPlans((p) => p.map((x) => (x.id === id ? ({ ...x, ...placement } as Plan) : x)));
    if (type === "focus") setFocuses((p) => p.map((x) => (x.id === id ? ({ ...x, ...placement } as Focus) : x)));
  }

  async function toggleTaskDone(id: string, nextDone: boolean) {
    const nextStatus = nextDone ? "done" : "open";
    const patch: any = { status: nextStatus };
    patch.completed_at = nextDone ? new Date().toISOString() : null;

    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) return console.error(error);

    setTasks((p) =>
      p.map((t) => (t.id === id ? ({ ...t, status: nextStatus, completed_at: patch.completed_at } as Task) : t))
    );
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return console.error(error);
    setTasks((p) => p.filter((t) => t.id !== id));
  }

  async function deletePlan(id: string) {
    const { error } = await supabase.from("plans").delete().eq("id", id);
    if (error) return console.error(error);
    setPlans((p) => p.filter((t) => t.id !== id));
  }

  async function deleteFocus(id: string) {
    const { error } = await supabase.from("focuses").delete().eq("id", id);
    if (error) return console.error(error);
    setFocuses((p) => p.filter((t) => t.id !== id));
  }

  async function addInline(iso: string) {
    ensureDayDraft(iso);
    const type = draftTypeByDay[iso] ?? "task";
    const raw = (draftByDay[iso]?.[type] ?? "").trim();
    if (!raw) return;

    await createItem({ titleRaw: raw, notes: "", targetValue: `D|${iso}`, itemType: type });

    setDraftByDay((prev) => ({
      ...prev,
      [iso]: { ...(prev[iso] ?? { task: "", plan: "", focus: "" }), [type]: "" },
    }));
  }

  async function addDrawer() {
    const raw = drawerDraft.trim();
    if (!raw) return;

    await createItem({ titleRaw: raw, notes: "", targetValue: getWindowValue(drawerWindow), itemType: drawerType });
    setDrawerDraft("");
  }

  function makeLocalId() {
    // Prefer UUID when available; fallback to a stable-ish string.
    const anyCrypto = globalThis.crypto as any;
    if (anyCrypto?.randomUUID) return anyCrypto.randomUUID() as string;
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function addContentItem() {
  const title = contentDraft.trim();
  if (!title) return;
  if (contentTab === "movies") return;

  const { data, error } = await supabase
    .from("focuses")
    .insert({
      title,
      notes: null,
      status: "active",
      scheduled_for: null,
      window_kind: null,
      window_start: null,
      content_category: contentTab,
    })
    .select("id,title,notes,status,scheduled_for,window_kind,window_start,content_category,created_at")
    .single();

  if (error) {
    console.warn("addContentItem", error);
    return;
  }

  if (data) setFocuses((p) => [data as any, ...p]);
  setContentDraft("");
}

  async function removeContentItem(id: string) {
  if (contentTab === "movies") return;

  const { error } = await supabase.from("focuses").delete().eq("id", id);
  if (error) {
    console.warn("removeContentItem", error);
    return;
  }

  setFocuses((p) => p.filter((f) => f.id !== id));
}

  const contentItems = useMemo(() => {
    if (contentTab === "movies") return [] as Focus[];
    return (contentFocusesByTab[contentTab] ?? []) as Focus[];
  }, [contentTab, contentFocusesByTab]);

  const todayIso = toISODate(days[0]);
  const bottomOpenIso = openDayIso && openDayIso !== todayIso ? openDayIso : null;

  function openEdit(type: ItemType, item: Task | Plan | Focus) {
    setEditType(type);
    setEditItem(item);
    setEditOpen(true);
  }

  async function saveEdit(patch: { itemType: ItemType; title: string; notes: string | null; targetValue: string; planStartTime?: string; planEndDate?: string; projectGoalId?: string }) {
    if (!editItem) return;
    const id = (editItem as any).id as string;

    let placement: { scheduled_for: string | null; window_kind: WindowKind | null; window_start: string | null };

    const tv = patch.targetValue;
    if (tv === "none") placement = { scheduled_for: null, window_kind: null, window_start: null };
    else if (tv.startsWith("D|")) placement = { scheduled_for: tv.split("|")[1], window_kind: null, window_start: null };
    else if (tv.startsWith("P|")) {
      const [, kind, start] = tv.split("|");
      placement = { scheduled_for: null, window_kind: kind as WindowKind, window_start: start };
    } else placement = { scheduled_for: null, window_kind: null, window_start: null };

    // If the type changed, convert by creating in the new table and deleting the old row.
    if (patch.itemType !== editType) {
      // Compute plan times if the new type is plan and it's scheduled on a day.
      let starts_at: string | null = null;
      if (placement.scheduled_for && patch.itemType === "plan") {
        if (patch.planStartTime) starts_at = new Date(`${placement.scheduled_for}T${patch.planStartTime}:00`).toISOString();
      }

      // Create in destination table
      if (patch.itemType === "task") {
        const { data, error } = await supabase
          .from("tasks")
          .insert({ title: patch.title, notes: patch.notes, status: "open", project_goal_id: null, ...placement })
          .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
          .single();
        if (error) return console.error(error);
        if (data) setTasks((p) => [...p, data as Task]);
      }

      if (patch.itemType === "focus") {
        const { data, error } = await supabase
          .from("focuses")
          .insert({ title: patch.title, notes: patch.notes, status: "active", project_goal_id: null, ...placement })
          .select("id,title,notes,status,scheduled_for,window_kind,window_start,content_category,project_goal_id,created_at")
          .single();
        if (error) return console.error(error);
        if (data) setFocuses((p) => [...p, data as Focus]);
      }

      if (patch.itemType === "plan") {
        // Optional multi-day end date (date-only)
        let end_date: string | null = null;
        if (placement.scheduled_for && patch.planEndDate && patch.planEndDate.trim()) {
          const endIso = patch.planEndDate.trim();
          if (endIso >= placement.scheduled_for) end_date = endIso;
        }

        const { data, error } = await supabase
          .from("plans")
          .insert({ title: patch.title, notes: patch.notes, status: "open", starts_at, end_date, project_goal_id: null, ...placement })
          .select("id,title,notes,starts_at,ends_at,end_date,status,scheduled_for,window_kind,window_start,project_goal_id,created_at")
          .single();
        if (error) return console.error(error);
        if (data) setPlans((p) => [...p, data as Plan]);
      }

      // Delete from source table + update local state arrays
      if (editType === "task") await deleteTask(id);
      if (editType === "plan") await deletePlan(id);
      if (editType === "focus") await deleteFocus(id);

      setEditOpen(false);
      return;
    }

    if (editType === "task") {
      const project_goal_id = patch.projectGoalId ? patch.projectGoalId : null;
      const { error } = await supabase.from("tasks").update({ title: patch.title, notes: patch.notes, project_goal_id, ...placement }).eq("id", id);
      if (error) return console.error(error);
      setTasks((p) => p.map((t) => (t.id === id ? ({ ...t, title: patch.title, notes: patch.notes, project_goal_id, ...placement } as Task) : t)));
      setEditOpen(false);
      return;
    }

    if (editType === "focus") {
      const project_goal_id = patch.projectGoalId ? patch.projectGoalId : null;
      const { error } = await supabase.from("focuses").update({ title: patch.title, notes: patch.notes, project_goal_id, ...placement }).eq("id", id);
      if (error) return console.error(error);
      setFocuses((p) => p.map((f) => (f.id === id ? ({ ...f, title: patch.title, notes: patch.notes, project_goal_id, ...placement } as Focus) : f)));
      setEditOpen(false);
      return;
    }

    // plan
    let starts_at: string | null = null;
    if (placement.scheduled_for && patch.planStartTime) starts_at = new Date(`${placement.scheduled_for}T${patch.planStartTime}:00`).toISOString();

    let end_date: string | null = null;
if (placement.scheduled_for && patch.planEndDate && patch.planEndDate.trim()) {
  const endIso = patch.planEndDate.trim();
  if (endIso >= placement.scheduled_for) {
    end_date = endIso;
  }
}

const project_goal_id = patch.projectGoalId ? patch.projectGoalId : null;
const { error } = await supabase
  .from("plans")
  .update({ title: patch.title, notes: patch.notes, starts_at, end_date, project_goal_id, ...placement })
  .eq("id", id);
    if (error) return console.error(error);

    setPlans((p) =>
      p.map((pl) =>
        pl.id === id ? ({ ...pl, title: patch.title, notes: patch.notes, starts_at, end_date, project_goal_id, ...placement } as Plan) : pl
      )
    );

    setEditOpen(false);
  }

  async function deleteEditItem() {
    if (!editItem) return;
    const id = (editItem as any).id as string;
    if (editType === "task") await deleteTask(id);
    if (editType === "plan") await deletePlan(id);
    if (editType === "focus") await deleteFocus(id);
    setEditOpen(false);
  }

  async function archiveEditedFocus() {
    if (!editItem || editType !== "focus") return;
    const id = (editItem as any).id as string;
    const { error } = await supabase.from("focuses").update({ status: "archived" }).eq("id", id);
    if (error) return console.error(error);
    setFocuses((p) => p.filter((f) => f.id !== id));
    setEditOpen(false);
  }

  return (
    <main className="h-dvh w-full max-w-full overflow-hidden px-4 pt-2 pb-3 sm:mx-auto sm:max-w-[1600px] lg:px-6 flex flex-col">
      {!authChecked ? (
        <div className="mt-3 text-sm text-neutral-400">Loading…</div>
      ) : !authReady ? (
        <div className="mt-3 text-sm text-neutral-400">Redirecting…</div>
      ) : loading ? (
        <div className="mt-3 text-sm text-neutral-400">Loading…</div>
      ) : (
        <>
          <div className="mt-0 grid min-w-0 gap-3 flex-shrink min-h-0 md:grid-cols-3 md:min-h-[450px] md:flex-[1_1_60%] md:items-stretch lg:gap-4">
            {/* Parking */}
            <section
              className={clsx(
                "order-1 min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900 shadow-sm md:order-none md:col-start-2 md:row-start-1 md:h-full md:overflow-y-auto md:overscroll-contain",
                parkingOpen ? "p-4" : "p-2"
              )}
            >
              <div className={clsx("flex min-w-0 gap-2 overflow-x-auto", parkingOpen ? "pb-2" : "pb-0")}>
                {([
                  ["thisWeek", `This Week (${drawerLists.thisWeek.task.length + drawerLists.thisWeek.plan.length + drawerLists.thisWeek.focus.length})`],
                  ["thisWeekend", `This Weekend (${drawerLists.thisWeekend.task.length + drawerLists.thisWeekend.plan.length + drawerLists.thisWeekend.focus.length})`],
                  ["nextWeek", `Next Week (${drawerLists.nextWeek.task.length + drawerLists.nextWeek.plan.length + drawerLists.nextWeek.focus.length})`],
                  ["nextWeekend", `Next Weekend (${drawerLists.nextWeekend.task.length + drawerLists.nextWeekend.plan.length + drawerLists.nextWeekend.focus.length})`],
                  ["open", `Open (${drawerLists.open.task.length + drawerLists.open.plan.length + drawerLists.open.focus.length})`],
                ] as const).map(([k, label]) => {
                  const active = parkingOpen && drawerWindow === k;
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        const next = k as DrawerWindow;
                        // If already open and they tap the same tab, collapse.
                        if (parkingOpen && drawerWindow === next) {
                          setParkingOpen(false);
                          return;
                        }
                        // Otherwise ensure it's open and switch to the tapped tab.
                        setParkingOpen(true);
                        setDrawerWindow(next);
                      }}
                      className={clsx(
                        "whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold",
                        active
                          ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                          : "border-neutral-800 bg-neutral-950 text-neutral-200"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {parkingOpen && (
                <>
                  <div className="mt-2">
                    <div className="mb-2 hidden gap-2 sm:mb-2 sm:gap-2 group-focus-within:flex" />
                    <div className="group">
                      <div className="mb-2 hidden gap-2 group-focus-within:flex">
                        {([
                          ["task", "Task"],
                          ["plan", "Plan"],
                          ["focus", "Intention"],
                        ] as const).map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={() => setDrawerType(k as ItemType)}
                            className={clsx(
                              "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                              drawerType === k
                                ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                                : "border-neutral-800 bg-neutral-950 text-neutral-200"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <input
                          value={drawerDraft}
                          onChange={(e) => setDrawerDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addDrawer();
                            }
                          }}
                          placeholder="Add…"
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-100 placeholder:text-neutral-500 outline-none sm:text-sm"
                        />

                        <button
                          type="button"
                          onPointerDown={(e) => {
                            // Prevent the input from blurring first (which collapses the type chips)
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            // Extra safety for desktop browsers
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            addDrawer();
                          }}
                          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Plans (italic, unboxed) */}
                  {drawerLists[drawerWindow].plan.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {drawerLists[drawerWindow].plan.map((p) => (
                        <PlanLine
                          key={p.id}
                          compact
                          plan={p}
                          moveTargets={moveTargets}
                          onMove={(id, v) => moveItem("plan", id, v)}
                          onEdit={(x) => openEdit("plan", x)}
                        />
                      ))}
                    </div>
                  ) : null}

                  {/* Focuses + Tasks (boxed) */}
                  <div
                    className={clsx(
                      "mt-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/20",
                      drawerLists[drawerWindow].plan.length > 0 ? "" : ""
                    )}
                  >
                    {drawerLists[drawerWindow].focus.map((f) => (
                      <FocusFloat
                        key={f.id}
                        focus={f}
                        moveTargets={moveTargets}
                        onMove={(id, v) => moveItem("focus", id, v)}
                        onEdit={(x) => openEdit("focus", x)}
                      />
                    ))}

                    {drawerLists[drawerWindow].task.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        moveTargets={moveTargets}
                        onMove={(id, v) => moveItem("task", id, v)}
                        onToggleDone={toggleTaskDone}
                        onEdit={(x) => openEdit("task", x)}
                      />
                    ))}

                    {drawerLists[drawerWindow].focus.length + drawerLists[drawerWindow].task.length === 0 &&
                      drawerLists[drawerWindow].plan.length === 0 && (
                        <div className="px-3 py-2 text-sm text-neutral-500">Empty.</div>
                      )}
                  </div>
                </>
              )}
            </section>

            {/* Content */}
            <section
  className={clsx(
    "order-2 min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900 shadow-sm md:order-none md:col-start-3 md:row-start-1 md:h-full md:overflow-y-auto md:overscroll-contain",
    contentOpen ? "p-4" : "p-2"
  )}
>
<div className={clsx("flex min-w-0 gap-2 overflow-x-auto", contentOpen ? "pb-2" : "pb-0")}>                {([
                  ["cook", "Cook"],
                  ["watch", "Watch"],
                  ["listen", "Listen"],
                  ["read", "Read"],
                  ["city", "City"],
                  ["movies", "Movies"],
                ] as const).map(([k, label]) => {
                  const count = k === "movies" ? movieItems.length : (contentFocusesByTab[k]?.length ?? 0);
                  // active only if contentOpen and contentTab match
                  const active = contentOpen && contentTab === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleContentTabClick(k as ContentTab)}
                      className={clsx(
                        "shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold",
                        active
                          ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                          : "border-neutral-800 bg-neutral-950 text-neutral-200"
                      )}
                    >
                      {label}{count ? ` (${count})` : ""}
                    </button>
                  );
                })}
              </div>

              {contentOpen && (
                <>
                  {contentTab !== "movies" && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={contentDraft}
                        onChange={(e) => setContentDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addContentItem();
                          }
                        }}
                        placeholder="Add…"
                        className="h-10 w-full flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-[16px] text-neutral-100 placeholder:text-neutral-500 outline-none sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={addContentItem}
                        className="shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  <div className="mt-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/25">
                    {contentTab === "movies" ? (
                      movieItems.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-neutral-400">No items yet.</div>
                      ) : (
                        <div className="divide-y divide-neutral-800/60">
                          {movieItems.map((m) => {
                            const showDropdown = movieDropdownId === m.id;
                            return (
                              <div key={m.id}>
                                <div
                                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-800/30 transition"
                                  onClick={() => setMovieDropdownId(showDropdown ? null : m.id)}
                                >
                                  <div className="min-w-0 flex-1 truncate text-base text-neutral-200">{m.title}</div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      aria-label="Move up"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveMoviePriority(m.id, "up");
                                      }}
                                      className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg border border-neutral-700 bg-neutral-800/50 grid place-items-center text-[12px] sm:text-[13px] text-neutral-300 hover:bg-neutral-700/50 active:scale-[0.98] transition"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Move down"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveMoviePriority(m.id, "down");
                                      }}
                                      className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg border border-neutral-700 bg-neutral-800/50 grid place-items-center text-[12px] sm:text-[13px] text-neutral-300 hover:bg-neutral-700/50 active:scale-[0.98] transition"
                                    >
                                      ▼
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Mark watched"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openWatchedModal(m.id);
                                      }}
                                      className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-neutral-700 bg-neutral-800/50 grid place-items-center text-neutral-300 hover:bg-neutral-700/50 active:scale-[0.98] transition"
                                    >
                                      ✓
                                    </button>
                                  </div>
                                </div>
                                {showDropdown && (
                                  <div className="px-3 pb-2">
                                    <MoveSelect
                                      value="none"
                                      onChange={(v) => scheduleMovieAsIntention(m.id, v)}
                                      moveTargets={moveTargets}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )
                    ) : contentItems.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-neutral-400">No items yet.</div>
                    ) : (
                      <div>
                        {contentItems.map((f) => (
                          <FocusRow
                            key={f.id}
                            focus={f}
                            moveTargets={moveTargets}
                            onMove={(id, v) => moveItem("focus", id, v)}
                            onEdit={(x) => openEdit("focus", x)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* Today */}
            <section
              className={clsx(
                "order-2 min-w-0 rounded-2xl border border-neutral-800 p-4 shadow-sm md:order-none md:col-start-1 md:row-start-1 md:h-full md:overflow-y-auto md:overscroll-contain",
                (days[0].getDay() === 0 || days[0].getDay() === 6) ? "bg-neutral-800/80" : "bg-neutral-900"
              )}
            >
            <div className="flex items-start justify-between gap-2">
              <div className="shrink-0">
                <div className="text-lg font-semibold">Today</div>
                <div className="mt-0.5 text-xs text-neutral-400">{fmtMonthDay(days[0])}</div>
              </div>

    {/* Habit chips (Today only) */}
              <div className="flex flex-1 flex-wrap justify-end gap-1">
                {trichLoggedToday === false && (
                  <div
                    aria-label="Trich check"
                    title="Trich check"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-400/70 bg-emerald-300 text-sm font-semibold text-neutral-900"
                  >
                    T
                  </div>
                )}
                {habits.map((h) => {
                  const label = (h.short_label && h.short_label.trim()) ? h.short_label.trim() : h.name.slice(0, 3).toUpperCase();
                  const isGym = label === "GYM";
                  const done = isGym ? gymDoneToday : habitDoneIds.has(h.id);

                  if (isGym) {
                    return (
                      <div
                        key={h.id}
                        className={clsx(
                          "grid h-9 min-w-[34px] place-items-center rounded-xl border px-2 text-xs font-semibold tracking-wide sm:px-3",
                          done
                            ? "border-emerald-400/70 bg-emerald-300 text-neutral-900"
                            : "border-neutral-800 bg-neutral-950 text-neutral-200"
                        )}
                        aria-label={h.name}
                        title={h.name}
                      >
                        {label}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={h.id}
                      type="button"
                      onPointerDown={(e) => {
                        // prevent text selection on long press
                        e.preventDefault();
                      }}
                      onClick={() => toggleHabitDone(h.id)}
                      className={clsx(
                        "grid h-9 min-w-[34px] place-items-center rounded-xl border px-2 text-xs font-semibold tracking-wide sm:px-3",
                        done
                          ? "border-emerald-400/70 bg-emerald-300 text-neutral-900"
                          : "border-neutral-800 bg-neutral-950 text-neutral-200"
                      )}
                      aria-label={h.name}
                      title={h.name}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inline add */}
            <div className="mt-3 group">
              <div className="mb-2 hidden gap-2 group-focus-within:flex">
                {([
                  ["task", "Task"],
                  ["plan", "Plan"],
                  ["focus", "Intention"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => {
                      ensureDayDraft(todayIso);
                      setDraftTypeByDay((p) => ({ ...p, [todayIso]: k as ItemType }));
                    }}
                    className={clsx(
                      "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                      (draftTypeByDay[todayIso] ?? "task") === k
                        ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                        : "border-neutral-800 bg-neutral-950 text-neutral-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  value={draftByDay[todayIso]?.[(draftTypeByDay[todayIso] ?? "task") as ItemType] ?? ""}
                  onFocus={() => ensureDayDraft(todayIso)}
                  onChange={(e) => {
                    ensureDayDraft(todayIso);
                    const type = (draftTypeByDay[todayIso] ?? "task") as ItemType;
                    setDraftByDay((prev) => ({
                      ...prev,
                      [todayIso]: { ...(prev[todayIso] ?? { task: "", plan: "", focus: "" }), [type]: e.target.value },
                    }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addInline(todayIso);
                    }
                  }}
                  placeholder="Add…"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[16px] text-neutral-100 placeholder:text-neutral-500 outline-none sm:text-sm"
                />

                <button
                  type="button"
                  onPointerDown={(e) => {
                    // Prevent the input from blurring first (which collapses the type chips)
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    // Extra safety for desktop browsers
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addInline(todayIso);
                  }}
                  className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Plans */}
            <PlanBand
              items={plansByDay[todayIso] ?? []}
              moveTargets={moveTargets}
              onMove={(id, v) => moveItem("plan", id, v)}
              onEdit={(p) => openEdit("plan", p)}
            />

            {/* Focuses */}
            {(focusesByDay[todayIso] ?? []).length ? (
              <div className={clsx("mt-3", "overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/20")}>
                {(focusesByDay[todayIso] ?? []).map((f) => (
                  <FocusRow
                    key={f.id}
                    focus={f}
                    moveTargets={moveTargets}
                    onMove={(id, v) => moveItem("focus", id, v)}
                    onEdit={(x) => openEdit("focus", x)}
                  />
                ))}
              </div>
            ) : null}

            {/* Tasks */}
            <div className="mt-4">
              {overdueTasks.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-red-300">Overdue</div>
                  <div className="mt-2 overflow-hidden rounded-xl border border-red-900/50 bg-red-950/10">
                    {overdueTasks.map((t) => (
                      <TaskRow key={t.id} task={t} moveTargets={moveTargets} onMove={(id, v) => moveItem("task", id, v)} onToggleDone={toggleTaskDone} onEdit={(t) => openEdit("task", t)} tone="overdue" />
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/20">
                {(tasksByDay[todayIso] ?? []).map((t) => (
                  <TaskRow key={t.id} task={t} moveTargets={moveTargets} onMove={(id, v) => moveItem("task", id, v)} onToggleDone={toggleTaskDone} onEdit={(t) => openEdit("task", t)} />
                ))}
              </div>
            </div>
            </section>
          </div>

          {/* Next 6 days */}
          <div className="mt-3 flex flex-col gap-3 flex-shrink min-h-0 overflow-y-auto md:flex-row md:flex-nowrap md:items-stretch md:basis-[40%] lg:gap-4">
            {days.slice(1).map((d, i) => {
              const iso = toISODate(d);
              const label = fmtDayLabel(d, i + 1);
              const isOpen = openDayIso === iso;
              const isAnotherOpen = Boolean(bottomOpenIso && bottomOpenIso !== iso);

              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const prevDay = days[i];
              const afterSunday = prevDay.getDay() === 0;

              const dayPlans = plansByDay[iso] ?? [];
              const dayTasks = tasksByDay[iso] ?? [];
              const dayFocus = focusesByDay[iso] ?? [];

              return (
                <Fragment key={iso}>
                  <section
                    className={clsx(
                      "rounded-2xl border border-neutral-800 p-4 shadow-sm md:min-w-0 md:overflow-y-auto md:h-full",
                      // Flex sizing on desktop/iPad: open card grows, others shrink slightly
                      isOpen ? "md:flex-[2]" : isAnotherOpen ? "md:flex-[0.85]" : "md:flex-1",
                      isWeekend ? "bg-neutral-800/80" : "bg-neutral-900"
                    )}
                  >
                  <button
                    onClick={() => {
                      ensureDayDraft(iso);
                      setOpenDayIso((cur) => (cur === iso ? null : iso));
                    }}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div>
                      <div className="font-semibold">{label}</div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        {fmtMonthDay(d)}
                      </div>
                    </div>
                    <div className="text-sm text-neutral-400">{isOpen ? "–" : "+"}</div>
                  </button>

                  {isOpen ? (
                    <>
                      <div className="mt-3 group">
                        <div className="mb-2 hidden gap-2 group-focus-within:flex">
                          {([
                            ["task", "Task"],
                            ["plan", "Plan"],
                            ["focus", "Intention"],
                          ] as const).map(([k, label]) => (
                            <button
                              key={k}
                              type="button"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={() => {
                                ensureDayDraft(iso);
                                setDraftTypeByDay((p) => ({ ...p, [iso]: k as ItemType }));
                              }}
                              className={clsx(
                                "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                                (draftTypeByDay[iso] ?? "task") === k
                                  ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                                  : "border-neutral-800 bg-neutral-950 text-neutral-200"
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <input
                            value={draftByDay[iso]?.[(draftTypeByDay[iso] ?? "task") as ItemType] ?? ""}
                            onFocus={() => ensureDayDraft(iso)}
                            onChange={(e) => {
                              const type = (draftTypeByDay[iso] ?? "task") as ItemType;
                              setDraftByDay((prev) => ({
                                ...prev,
                                [iso]: { ...(prev[iso] ?? { task: "", plan: "", focus: "" }), [type]: e.target.value },
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addInline(iso);
                              }
                            }}
                            placeholder="Add…"
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-100 placeholder:text-neutral-500 outline-none sm:text-sm"
                          />

                          <button
                            type="button"
                            onPointerDown={(e) => {
                              // Prevent the input from blurring first (which collapses the type chips)
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onMouseDown={(e) => {
                              // Extra safety for desktop browsers
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              addInline(iso);
                            }}
                            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      {/* Plans */}
                      <PlanBand
                        compact={isMdUp}
                        items={dayPlans}
                        moveTargets={moveTargets}
                        onMove={(id, v) => moveItem("plan", id, v)}
                        onEdit={(p) => openEdit("plan", p)}
                      />

                      {/* Focuses */}
                      {dayFocus.length ? (
                        <div
                          className={clsx(
                            isMdUp ? "mt-2" : "mt-3",
                            "overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/20"
                          )}
                        >
                          {dayFocus.map((f) => (
                            <FocusRow
                              compact={isMdUp}
                              key={f.id}
                              focus={f}
                              moveTargets={moveTargets}
                              onMove={(id, v) => moveItem("focus", id, v)}
                              onEdit={(x) => openEdit("focus", x)}
                            />
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4">
                        <div className="mt-2 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/20">
                          {dayTasks.map((t) => (
                            <TaskRow compact={isMdUp} key={t.id} task={t} moveTargets={moveTargets} onMove={(id, v) => moveItem("task", id, v)} onToggleDone={toggleTaskDone} onEdit={(t) => openEdit("task", t)} />
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Plans */}
                      <PlanBand
                        compact
                        items={dayPlans}
                        moveTargets={moveTargets}
                        onMove={(id, v) => moveItem("plan", id, v)}
                        onEdit={(p) => openEdit("plan", p)}
                      />

                      {/* Focuses */}
                      {dayFocus.length ? (
                        <div className={clsx("mt-3", "overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/20")}>
                          {dayFocus.map((f) => (
                            <FocusRow
                              compact
                              key={f.id}
                              focus={f}
                              moveTargets={moveTargets}
                              onMove={(id, v) => moveItem("focus", id, v)}
                              onEdit={(x) => openEdit("focus", x)}
                            />
                          ))}
                        </div>
                      ) : null}

                      {/* Tasks */}
                      <div className={clsx("mt-3", "overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/20")}>
                        {dayTasks.map((t) => (
                          <TaskRow
                            compact
                            key={t.id}
                            task={t}
                            moveTargets={moveTargets}
                            onMove={(id, v) => moveItem("task", id, v)}
                            onToggleDone={toggleTaskDone}
                            onEdit={(t) => openEdit("task", t)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  </section>
                </Fragment>
              );
            })}
          </div>
        </>
      )}

      {/* Floating add */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-[55] h-12 w-12 rounded-full border border-neutral-800 bg-neutral-100 text-xl font-semibold text-neutral-900 shadow-lg active:scale-[0.98]"
        aria-label="Add"
        title="Add"
      >
        +
      </button>

      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        moveTargets={moveTargets}
        defaultTarget={openDayIso ? `D|${openDayIso}` : `D|${todayIso}`}
        projectGoals={projectGoals}
        onCreate={async (args) => {
          await createItem({
            titleRaw: args.titleRaw,
            notes: args.notes,
            targetValue: args.targetValue,
            itemType: args.itemType,
            planStartTime: args.planStartTime,
            planEndDate: args.planEndDate,
            planDayOff: args.planDayOff,
            projectGoalId: args.projectGoalId,
          });
        }}
      />

      <EditSheet
        open={editOpen}
        item={editItem}
        itemType={editType}
        onClose={() => setEditOpen(false)}
        moveTargets={moveTargets}
        projectGoals={projectGoals}
        onSave={saveEdit}
        onDelete={deleteEditItem}
        onArchiveFocus={archiveEditedFocus}
      />

      {/* Movie Watched Modal */}
      {watchingMovieId ? (
        <div className="fixed inset-0 z-50 grid place-items-center px-5">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setWatchingMovieId(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-950 p-4 shadow-2xl">
            <div className="text-lg font-semibold mb-1">Mark watched</div>
            <div className="text-sm text-neutral-400 mb-4 truncate">
              {movieItems.find((m) => m.id === watchingMovieId)?.title ?? ""}
            </div>

            <label className="block text-xs text-neutral-400 mb-1">Watched date</label>
            <input
              type="date"
              value={watchedDate}
              onChange={(e) => setWatchedDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-neutral-100 outline-none"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setWatchingMovieId(null)}
                className="h-11 flex-1 rounded-xl border border-neutral-700 bg-neutral-800/50 text-neutral-100 font-semibold hover:bg-neutral-700/50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMarkWatched}
                className="h-11 flex-1 rounded-xl bg-white text-black font-semibold hover:bg-neutral-100 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}