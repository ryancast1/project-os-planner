"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  created_at: string;
  completed_at?: string | null;
};

type Plan = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string | null; // ISO
  ends_at: string | null; // ISO
  status: "open" | "done" | "canceled";
  scheduled_for: string | null; // YYYY-MM-DD
  window_kind: WindowKind | null;
  window_start: string | null; // YYYY-MM-DD
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
  created_at: string;
};

type ItemType = "task" | "plan" | "focus";

type DrawerWindow = "thisWeek" | "thisWeekend" | "nextWeek" | "nextWeekend" | "open";

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

function fmtDayLabel(d: Date, index: number) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function fmtMonthDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
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
  onDelete,
}: {
  tone?: "normal" | "overdue";
  children: React.ReactNode;
  onDelete?: () => void;
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
    if (!onDelete) return;

    // Long-press delete ONLY on touch. Desktop uses right-click.
    if (e.pointerType !== "touch") return;

    // If they pressed on a control inside the row (checkbox/move select), do not arm delete.
    if (isInteractiveTarget(e.target)) return;

    clear();
    startRef.current = { x: e.clientX, y: e.clientY };

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startRef.current = null;
      // On iOS, this is effectively the long-press action.
      if (confirm("Delete this item?")) onDelete();
    }, 750);
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
        "flex items-center gap-2 rounded-xl border px-3 py-2",
        tone === "overdue" ? "border-red-900/60 bg-red-950/30" : "border-neutral-800 bg-neutral-900"
      )}
      onPointerDown={start}
      onPointerMove={maybeCancelOnMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        if (!onDelete) return;
        e.preventDefault();
        if (confirm("Delete this item?")) onDelete();
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
}: {
  value: string;
  onChange: (v: string) => void;
  moveTargets: MoveTarget[];
}) {
  const dayTargets = moveTargets.filter((t) => t.group === "days");
  const parkingTargets = moveTargets.filter((t) => t.group === "parking");

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-200 outline-none"
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
  onDelete,
  tone,
}: {
  task: Task;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onToggleDone: (id: string, nextDone: boolean) => void;
  onDelete: (id: string) => void;
  tone?: "normal" | "overdue";
}) {
  const isDone = task.status === "done";

  return (
    <RowShell tone={tone} onDelete={() => onDelete(task.id)}>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(task.id, !isDone);
        }}
        className={clsx(
          "shrink-0 h-6 w-6 rounded-md border grid place-items-center",
          isDone ? "border-neutral-500 bg-neutral-200 text-neutral-900" : "border-neutral-700 bg-neutral-950 text-neutral-200"
        )}
        aria-label={isDone ? "Mark not done" : "Mark done"}
        title={isDone ? "Mark not done" : "Mark done"}
      >
        {isDone ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1">
        <div className={clsx("truncate text-sm", isDone && "line-through text-neutral-500")}>
          {task.title}
        </div>
      </div>

      <MoveSelect value={locationValueFor(task)} onChange={(v) => onMove(task.id, v)} moveTargets={moveTargets} />
    </RowShell>
  );
}

function PlanRow({
  plan,
  moveTargets,
  onMove,
  onDelete,
}: {
  plan: Plan;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <RowShell onDelete={() => onDelete(plan.id)}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          {plan.title}
          <TimePill startsAt={plan.starts_at} endsAt={plan.ends_at} />
        </div>
      </div>

      <MoveSelect value={locationValueFor(plan)} onChange={(v) => onMove(plan.id, v)} moveTargets={moveTargets} />
    </RowShell>
  );
}

function FocusRow({
  focus,
  moveTargets,
  onMove,
  onDelete,
}: {
  focus: Focus;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <RowShell onDelete={() => onDelete(focus.id)}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{focus.title}</div>
      </div>

      <MoveSelect value={locationValueFor(focus)} onChange={(v) => onMove(focus.id, v)} moveTargets={moveTargets} />
    </RowShell>
  );
}

function FocusFloat({
  focus,
  moveTargets,
  onMove,
  onDelete,
}: {
  focus: Focus;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-neutral-200/90"
      onPointerDown={() => {
        // no-op; long press handled by RowShell style below
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (confirm("Delete this item?")) onDelete(focus.id);
      }}
    >
      <div className="min-w-0 flex-1 italic truncate">{focus.title}</div>
      <div className="opacity-70">
        <MoveSelect value={locationValueFor(focus)} onChange={(v) => onMove(focus.id, v)} moveTargets={moveTargets} />
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
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (args: {
    titleRaw: string;
    notes: string;
    targetValue: string;
    itemType: ItemType;
    planStartTime: string;
    planEndTime: string;
  }) => void;
  moveTargets: MoveTarget[];
  defaultTarget: string;
}) {
  const [itemType, setItemType] = useState<ItemType>("task");
  const [titleRaw, setTitleRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [targetValue, setTargetValue] = useState(defaultTarget);
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndTime, setPlanEndTime] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemType("task");
    setTitleRaw("");
    setNotes("");
    setTargetValue(defaultTarget);
    setPlanStartTime("");
    setPlanEndTime("");
  }, [open, defaultTarget]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        onCreate({ titleRaw, notes, targetValue, itemType, planStartTime, planEndTime });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onCreate, titleRaw, notes, targetValue, itemType, planStartTime, planEndTime]);

  const dayTargets = moveTargets.filter((t) => t.group === "days");
  const parkingTargets = moveTargets.filter((t) => t.group === "parking");
  const isDayTarget = targetValue.startsWith("D|");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />

      <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-xl">
        <div className="rounded-t-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Add</div>
            <button
              onClick={onClose}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
            >
              Close
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Type</div>
              <div className="flex gap-2">
                {([
                  ["task", "Task"],
                  ["plan", "Plan"],
                  ["focus", "Focus"],
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
                placeholder="e.g. Call Papa #sun"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
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
                onChange={(e) => setTargetValue(e.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none"
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
            </div>

            {itemType === "plan" && isDayTarget && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Start (optional)</div>
                  <input
                    type="time"
                    value={planStartTime}
                    onChange={(e) => setPlanStartTime(e.target.value)}
                    className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">End (optional)</div>
                  <input
                    type="time"
                    value={planEndTime}
                    onChange={(e) => setPlanEndTime(e.target.value)}
                    className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs text-neutral-400">Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="min-h-[92px] w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onCreate({ titleRaw, notes, targetValue, itemType, planStartTime, planEndTime })}
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
  const [loading, setLoading] = useState(true);

  const [draftByDay, setDraftByDay] = useState<Record<string, Record<ItemType, string>>>({});
  const [draftTypeByDay, setDraftTypeByDay] = useState<Record<string, ItemType>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWindow, setDrawerWindow] = useState<DrawerWindow>("thisWeek");
  const [drawerDraft, setDrawerDraft] = useState("");

  const [openDayIso, setOpenDayIso] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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

    const start = toISODate(days[0]);
    const end = toISODate(days[6]);

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
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
        .in("status", ["open", "done"])
        .not("scheduled_for", "is", null)
        .gte("scheduled_for", start)
        .lte("scheduled_for", end)
        .order("scheduled_for", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("tasks")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
        .eq("status", "open")
        .not("scheduled_for", "is", null)
        .lt("scheduled_for", start)
        .order("scheduled_for", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("tasks")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
        .eq("status", "open")
        .is("scheduled_for", null)
        .or(`${parkingOr},and(window_kind.is.null,window_start.is.null)`)
        .order("created_at", { ascending: true }),

      supabase
        .from("plans")
        .select("id,title,notes,starts_at,ends_at,status,scheduled_for,window_kind,window_start,created_at")
        .eq("status", "open")
        .not("scheduled_for", "is", null)
        .gte("scheduled_for", start)
        .lte("scheduled_for", end)
        .order("scheduled_for", { ascending: true })
        .order("starts_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("plans")
        .select("id,title,notes,starts_at,ends_at,status,scheduled_for,window_kind,window_start,created_at")
        .eq("status", "open")
        .is("scheduled_for", null)
        .or(`${parkingOr},and(window_kind.is.null,window_start.is.null)`)
        .order("created_at", { ascending: true }),

      supabase
        .from("focuses")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
        .eq("status", "active")
        .not("scheduled_for", "is", null)
        .gte("scheduled_for", start)
        .lte("scheduled_for", end)
        .order("scheduled_for", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("focuses")
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
        .eq("status", "active")
        .is("scheduled_for", null)
        .or(`${parkingOr},and(window_kind.is.null,window_start.is.null)`)
        .order("created_at", { ascending: true }),
    ]);

    if (tasksScheduledRes.error) console.error(tasksScheduledRes.error);
    if (tasksOverdueRes.error) console.error(tasksOverdueRes.error);
    if (tasksParkingRes.error) console.error(tasksParkingRes.error);
    if (plansScheduledRes.error) console.error(plansScheduledRes.error);
    if (plansParkingRes.error) console.error(plansParkingRes.error);
    if (focusesScheduledRes.error) console.error(focusesScheduledRes.error);
    if (focusesParkingRes.error) console.error(focusesParkingRes.error);

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

    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
    setOpenDayIso(toISODate(days[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    for (const d of days) map[toISODate(d)] = [];
    for (const p of plans) {
      if (!p.scheduled_for) continue;
      if (map[p.scheduled_for]) map[p.scheduled_for].push(p);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
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

    const matchWindow = (kind: WindowKind | null, start: string | null) => {
      if (!kind || !start) return null;
      if (kind === "workweek" && start === windows.thisWeekStart) return "thisWeek" as const;
      if (kind === "weekend" && start === windows.thisWeekendStart) return "thisWeekend" as const;
      if (kind === "workweek" && start === windows.nextWeekStart) return "nextWeek" as const;
      if (kind === "weekend" && start === windows.nextWeekendStart) return "nextWeekend" as const;
      return null;
    };

    for (const t of tasks) {
      if (t.scheduled_for) continue;
      const which = matchWindow(t.window_kind, t.window_start);
      if (which) out[which].task.push(t);
      else if (!t.window_kind && !t.window_start) out.open.task.push(t);
    }
    for (const p of plans) {
      if (p.scheduled_for) continue;
      const which = matchWindow(p.window_kind, p.window_start);
      if (which) out[which].plan.push(p);
      else if (!p.window_kind && !p.window_start) out.open.plan.push(p);
    }
    for (const f of focuses) {
      if (f.scheduled_for) continue;
      const which = matchWindow(f.window_kind, f.window_start);
      if (which) out[which].focus.push(f);
      else if (!f.window_kind && !f.window_start) out.open.focus.push(f);
    }

    return out;
  }, [tasks, plans, focuses, windows]);

  const thisWeekFocusOverlay = useMemo(() => {
    const start = new Date(windows.thisWeekStart);
    const startIso = windows.thisWeekStart;
    const endIso = toISODate(addDays(start, 4));
    const overlay = focuses.filter((f) => !f.scheduled_for && f.window_kind === "workweek" && f.window_start === startIso);
    return { startIso, endIso, overlay };
  }, [focuses, windows]);

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
    planEndTime?: string;
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
        .insert({ title, notes: notesVal, status: "open", ...placement })
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
        .single();
      if (error) return console.error(error);
      if (data) setTasks((p) => [...p, data as Task]);
      return;
    }

    if (parsed.itemType === "focus") {
      const { data, error } = await supabase
        .from("focuses")
        .insert({ title, notes: notesVal, status: "active", ...placement })
        .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
        .single();
      if (error) return console.error(error);
      if (data) setFocuses((p) => [...p, data as Focus]);
      return;
    }

    // plan
    let starts_at: string | null = null;
    let ends_at: string | null = null;

    if (placement.scheduled_for && args.planStartTime) starts_at = new Date(`${placement.scheduled_for}T${args.planStartTime}:00`).toISOString();
    if (placement.scheduled_for && args.planEndTime) ends_at = new Date(`${placement.scheduled_for}T${args.planEndTime}:00`).toISOString();

    const { data, error } = await supabase
      .from("plans")
      .insert({ title, notes: notesVal, status: "open", starts_at, ends_at, ...placement })
      .select("id,title,notes,starts_at,ends_at,status,scheduled_for,window_kind,window_start,created_at")
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

    await createItem({ titleRaw: raw, notes: "", targetValue: getWindowValue(drawerWindow), itemType: "task" });
    setDrawerDraft("");
  }

  const todayIso = toISODate(days[0]);

  return (
    <main className="min-h-dvh p-4 pb-28">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Planner</h1>
        </div>
      </div>

      <div className="mt-4 h-px w-full bg-neutral-800" />

      {loading ? (
        <div className="mt-6 text-sm text-neutral-400">Loading…</div>
      ) : (
        <>
          {/* Today */}
          <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Today</div>
                <div className="mt-0.5 text-xs text-neutral-400">{fmtMonthDay(days[0])}</div>
              </div>
              
            </div>

            {/* Inline add */}
            <div className="mt-3 flex gap-2">
              <select
                value={draftTypeByDay[todayIso] ?? "task"}
                onChange={(e) => {
                  ensureDayDraft(todayIso);
                  setDraftTypeByDay((p) => ({ ...p, [todayIso]: e.target.value as ItemType }));
                }}
                className="h-10 w-[92px] rounded-xl border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none"
              >
                <option value="task">Task</option>
                <option value="plan">Plan</option>
                <option value="focus">Focus</option>
              </select>

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
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
              />

              

              <button
                onClick={() => addInline(todayIso)}
                className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
              >
                Add
              </button>
            </div>

            {/* Plans */}
            <div className="mt-4">
              <div className="mt-2 space-y-2">
                {(plansByDay[todayIso] ?? []).map((p) => (
                  <PlanRow key={p.id} plan={p} moveTargets={moveTargets} onMove={(id, v) => moveItem("plan", id, v)} onDelete={deletePlan} />
                ))}
              </div>
            </div>

            {/* Tasks */}
            <div className="mt-4">
              {overdueTasks.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-red-300">Overdue</div>
                  <div className="mt-2 space-y-2">
                    {overdueTasks.map((t) => (
                      <TaskRow key={t.id} task={t} moveTargets={moveTargets} onMove={(id, v) => moveItem("task", id, v)} onToggleDone={toggleTaskDone} onDelete={deleteTask} tone="overdue" />
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2 space-y-2">
                {(tasksByDay[todayIso] ?? []).map((t) => (
                  <TaskRow key={t.id} task={t} moveTargets={moveTargets} onMove={(id, v) => moveItem("task", id, v)} onToggleDone={toggleTaskDone} onDelete={deleteTask} />
                ))}
              </div>
            </div>

            {/* Focus */}
            <div className="mt-4">
              <div className="mt-2 space-y-2">
                {todayIso >= thisWeekFocusOverlay.startIso && todayIso <= thisWeekFocusOverlay.endIso &&
                  thisWeekFocusOverlay.overlay.map((f) => (
                    <FocusFloat key={`ov-${f.id}`} focus={f} moveTargets={moveTargets} onMove={(id, v) => moveItem("focus", id, v)} onDelete={deleteFocus} />
                  ))}
                {(focusesByDay[todayIso] ?? []).map((f) => (
                  <FocusFloat key={f.id} focus={f} moveTargets={moveTargets} onMove={(id, v) => moveItem("focus", id, v)} onDelete={deleteFocus} />
                ))}
              </div>
            </div>
          </section>

          {/* Next 6 days */}
          <div className="mt-4 space-y-3">
            {days.slice(1).map((d, i) => {
              const iso = toISODate(d);
              const label = fmtDayLabel(d, i + 1);
              const isOpen = openDayIso === iso;

              const dayPlans = plansByDay[iso] ?? [];
              const dayTasks = tasksByDay[iso] ?? [];
              const dayFocus = focusesByDay[iso] ?? [];

              return (
                <section key={iso} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
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
                      <div className="mt-3 flex gap-2">
                        <select
                          value={draftTypeByDay[iso] ?? "task"}
                          onChange={(e) => setDraftTypeByDay((p) => ({ ...p, [iso]: e.target.value as ItemType }))}
                          className="h-10 w-[92px] rounded-xl border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none"
                        >
                          <option value="task">Task</option>
                          <option value="plan">Plan</option>
                          <option value="focus">Focus</option>
                        </select>

                        <input
                          value={draftByDay[iso]?.[(draftTypeByDay[iso] ?? "task") as ItemType] ?? ""}
                          onChange={(e) => {
                            const type = (draftTypeByDay[iso] ?? "task") as ItemType;
                            setDraftByDay((prev) => ({
                              ...prev,
                              [iso]: { ...(prev[iso] ?? { task: "", plan: "", focus: "" }), [type]: e.target.value },
                            }));
                          }}
                          placeholder="Add…"
                          onKeyDown={(e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addInline(iso);
  }
}}
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
                        />

                        <button
                          onClick={() => addInline(iso)}
                          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                        >
                          Add
                        </button>
                      </div>

                      <div className="mt-4">
                        <div className="mt-2 space-y-2">
                          {dayPlans.map((p) => (
                            <PlanRow key={p.id} plan={p} moveTargets={moveTargets} onMove={(id, v) => moveItem("plan", id, v)} onDelete={deletePlan} />
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mt-2 space-y-2">
                          {dayTasks.map((t) => (
                            <TaskRow key={t.id} task={t} moveTargets={moveTargets} onMove={(id, v) => moveItem("task", id, v)} onToggleDone={toggleTaskDone} onDelete={deleteTask} />
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mt-2 space-y-2">
                          {iso >= thisWeekFocusOverlay.startIso && iso <= thisWeekFocusOverlay.endIso &&
                            thisWeekFocusOverlay.overlay.map((f) => (
                              <FocusFloat key={`ov-${iso}-${f.id}`} focus={f} moveTargets={moveTargets} onMove={(id, v) => moveItem("focus", id, v)} onDelete={deleteFocus} />
                            ))}
                          {dayFocus.map((f) => (
                            <FocusFloat key={f.id} focus={f} moveTargets={moveTargets} onMove={(id, v) => moveItem("focus", id, v)} onDelete={deleteFocus} />
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {dayFocus.map((f) => (
                        <FocusFloat
                          key={f.id}
                          focus={f}
                          moveTargets={moveTargets}
                          onMove={(id, v) => moveItem("focus", id, v)}
                          onDelete={deleteFocus}
                        />
                      ))}

                      {dayPlans.map((p) => (
                        <PlanRow
                          key={p.id}
                          plan={p}
                          moveTargets={moveTargets}
                          onMove={(id, v) => moveItem("plan", id, v)}
                          onDelete={deletePlan}
                        />
                      ))}

                      {dayTasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          moveTargets={moveTargets}
                          onMove={(id, v) => moveItem("task", id, v)}
                          onToggleDone={toggleTaskDone}
                          onDelete={deleteTask}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-xl">
          {!drawerOpen ? (
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-full rounded-t-2xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-neutral-400">
                  Week {drawerLists.thisWeek.task.length + drawerLists.thisWeek.plan.length + drawerLists.thisWeek.focus.length} • Weekend{" "}
                  {drawerLists.thisWeekend.task.length + drawerLists.thisWeekend.plan.length + drawerLists.thisWeekend.focus.length} • Next{" "}
                  {drawerLists.nextWeek.task.length + drawerLists.nextWeek.plan.length + drawerLists.nextWeek.focus.length} • Next Wknd{" "}
                  {drawerLists.nextWeekend.task.length + drawerLists.nextWeekend.plan.length + drawerLists.nextWeekend.focus.length}
                  • Open {drawerLists.open.task.length + drawerLists.open.plan.length + drawerLists.open.focus.length}
                </div>
                <div className="text-sm text-neutral-400">▲</div>
              </div>
            </button>
          ) : (
            <div className="rounded-t-2xl border border-neutral-800 bg-neutral-950">
              <div className="flex items-center justify-between px-4 py-2">
                <div />
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                >
                  Close
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto px-4 pb-2">
                {([
                  ["thisWeek", `This Week (${drawerLists.thisWeek.task.length + drawerLists.thisWeek.plan.length + drawerLists.thisWeek.focus.length})`],
                  ["thisWeekend", `This Weekend (${drawerLists.thisWeekend.task.length + drawerLists.thisWeekend.plan.length + drawerLists.thisWeekend.focus.length})`],
                  ["nextWeek", `Next Week (${drawerLists.nextWeek.task.length + drawerLists.nextWeek.plan.length + drawerLists.nextWeek.focus.length})`],
                  ["nextWeekend", `Next Weekend (${drawerLists.nextWeekend.task.length + drawerLists.nextWeekend.plan.length + drawerLists.nextWeekend.focus.length})`],
                  ["open", `Open (${drawerLists.open.task.length + drawerLists.open.plan.length + drawerLists.open.focus.length})`],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setDrawerWindow(k as DrawerWindow)}
                    className={clsx(
                      "whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold",
                      drawerWindow === k ? "border-neutral-200 bg-neutral-100 text-neutral-900" : "border-neutral-800 bg-neutral-900 text-neutral-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[55vh] overflow-y-auto px-4 pb-4">
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
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
                  />
                  <button
                    onClick={addDrawer}
                    className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {drawerLists[drawerWindow].focus.map((f) => (
                    <FocusRow
                      key={f.id}
                      focus={f}
                      moveTargets={moveTargets}
                      onMove={(id, v) => moveItem("focus", id, v)}
                      onDelete={deleteFocus}
                    />
                  ))}

                  {drawerLists[drawerWindow].plan.map((p) => (
                    <PlanRow
                      key={p.id}
                      plan={p}
                      moveTargets={moveTargets}
                      onMove={(id, v) => moveItem("plan", id, v)}
                      onDelete={deletePlan}
                    />
                  ))}

                  {drawerLists[drawerWindow].task.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      moveTargets={moveTargets}
                      onMove={(id, v) => moveItem("task", id, v)}
                      onToggleDone={toggleTaskDone}
                      onDelete={deleteTask}
                    />
                  ))}

                  {drawerLists[drawerWindow].focus.length + drawerLists[drawerWindow].plan.length + drawerLists[drawerWindow].task.length === 0 && (
                    <div className="text-sm text-neutral-500">Empty.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating add */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-20 right-4 z-[55] h-12 w-12 rounded-full border border-neutral-800 bg-neutral-100 text-xl font-semibold text-neutral-900 shadow-lg active:scale-[0.98]"
        aria-label="Add"
        title="Add"
      >
        +
      </button>

      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={async ({ titleRaw, notes, targetValue, itemType, planStartTime, planEndTime }) => {
          await createItem({ titleRaw, notes, targetValue, itemType, planStartTime, planEndTime });
          setAddOpen(false);
        }}
        moveTargets={moveTargets}
        defaultTarget={`D|${todayIso}`}
      />
    </main>
  );
}