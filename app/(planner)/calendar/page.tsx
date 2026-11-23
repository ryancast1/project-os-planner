"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { supabase } from "../../../lib/supabaseClient";
import { planEndDate, resizePlanEnd } from "@/lib/planSchedule";
import DayScheduleView, { type DayScheduleItem } from "@/components/DayScheduleView";
type Plan = {
  id: string;
  title: string;
  scheduled_for: string; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  day_off?: boolean | null;
};

type Task = {
  id: string;
  title: string;
  scheduled_for: string;
  status: string;
  sort_order?: number | null;
};

type Focus = {
  id: string;
  title: string;
  scheduled_for: string;
  status?: string | null;
  sort_order?: number | null;
};

type ContentItem = {
  id: string;
  title: string;
  category: string;
  is_ongoing: boolean;
  status: string;
  scheduled_for: string | null;
};

type ContentSession = {
  id: string;
  content_item_id: string | null;
  movie_tracker_id: string | null;
  scheduled_for: string;
  status: string;
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
  return planEndDate(p) ?? p.scheduled_for;
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

function buildWeekRows(start: Date, weekCount: number) {
  return Array.from({ length: weekCount }).map((_, w) => {
    const rowStart = addDays(start, w * 7);
    return Array.from({ length: 7 }).map((__, i) => addDays(rowStart, i));
  });
}

function buildYearWeekRows(year: number) {
  const firstWeekStart = startOfWeekMonday(new Date(year, 0, 1));
  const lastWeekStart = startOfWeekMonday(new Date(year, 11, 31));
  const out: Date[][] = [];

  for (let start = firstWeekStart; start <= lastWeekStart; start = addDays(start, 7)) {
    out.push(Array.from({ length: 7 }).map((_, i) => addDays(start, i)));
  }

  return out;
}

function fmtWeekday(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function fmtMonthDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function fmtShortMonth(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short" });
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

function DayCell({
  d,
  iso,
  isToday,
  dayPlans,
  maxPlansPerCell,
  planBarSpace,
  weekend,
  dayOff,
  monthChangeFromTop,
  monthChangeFromLeft,
  dIdx,
  onOpenDay,
}: {
  d: Date;
  iso: string;
  isToday: boolean;
  dayPlans: Plan[];
  maxPlansPerCell: number;
  planBarSpace: number;
  weekend: boolean;
  dayOff: boolean;
  monthChangeFromTop: boolean;
  monthChangeFromLeft: boolean;
  dIdx: number;
  onOpenDay: (iso: string) => void;
}) {
  const lp = useLongPress({
    onLongPress: () => onOpenDay(iso),
    ms: 450,
  });

  const show = dayPlans.slice(0, maxPlansPerCell);
  const extra = Math.max(0, dayPlans.length - show.length);

  return (
    <div
      {...lp}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenDay(iso);
      }}
      className={clsx(
        "relative flex min-h-[calc(100cqw/7)] min-w-0 flex-col select-none px-1 pt-6 transition-colors",
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
      style={{ touchAction: "manipulation", paddingBottom: planBarSpace || 4 }}
    >
      <div className="absolute right-1 top-1 text-[10px] font-medium text-neutral-400 md:landscape:text-xs">{d.getDate()}</div>

      <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1 landscape:space-y-1 md:landscape:space-y-2 md:landscape:flex md:landscape:flex-col md:landscape:justify-center">
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
}

export default function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const week0 = useMemo(() => startOfWeekMonday(today), [today]);
  const [yearView, setYearView] = useState(false);
  const [visibleYear, setVisibleYear] = useState(() => today.getFullYear());
  const currentWeekRowRef = useRef<HTMLDivElement | null>(null);
  const scrollToCurrentWeekRef = useRef(false);

  const weeks = useMemo(() => {
    if (yearView) return buildYearWeekRows(visibleYear);

    // Current week + next 12 weeks (13 total future weeks).
    return buildWeekRows(week0, 13);
  }, [week0, yearView, visibleYear]);

  const range = useMemo(() => {
    const start = toISODate(weeks[0][0]);
    const end = toISODate(weeks[weeks.length - 1][6]);
    return { start, end };
  }, [weeks]);

  const todayIso = useMemo(() => toISODate(today), [today]);

  useEffect(() => {
    if (!yearView || !scrollToCurrentWeekRef.current) return;

    currentWeekRowRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
    scrollToCurrentWeekRef.current = false;
  }, [yearView, weeks]);

  const [plans, setPlans] = useState<Plan[]>([]);
  const planWriteVersion = useRef(0);
  const [refreshVersion, refresh] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentSessions, setContentSessions] = useState<ContentSession[]>([]);
  const [movieLookup, setMovieLookup] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const [openIso, setOpenIso] = useState<string | null>(null);
  const [scheduleViewDate, setScheduleViewDate] = useState<string | null>(null);
  const [scheduleItems, setScheduleItems] = useState<DayScheduleItem[]>([]);

  // Fetch schedule items when schedule view opens
  useEffect(() => {
    if (!scheduleViewDate) { setScheduleItems([]); return; }
    supabase
      .from('day_schedule_items')
      .select('*')
      .eq('scheduled_date', scheduleViewDate)
      .then(({ data, error }) => { if (!error && data) setScheduleItems(data); });
  }, [scheduleViewDate]);

  async function createScheduleItem(item: { title: string; starts_at: string; ends_at: string }) {
    if (!scheduleViewDate) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('day_schedule_items')
      .insert({ user_id: user.id, scheduled_date: scheduleViewDate, title: item.title, starts_at: item.starts_at, ends_at: item.ends_at })
      .select()
      .single();
    if (!error && data) setScheduleItems(prev => [...prev, data]);
  }

  async function updateScheduleItem(id: string, updates: Partial<DayScheduleItem>) {
    const { error } = await supabase
      .from('day_schedule_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) setScheduleItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }

  async function deleteScheduleItem(id: string) {
    const { error } = await supabase
      .from('day_schedule_items')
      .delete()
      .eq('id', id);
    if (!error) setScheduleItems(prev => prev.filter(item => item.id !== id));
  }

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
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh((version) => version + 1);
    };
    window.addEventListener("focus", refreshWhenVisible);
    return () => window.removeEventListener("focus", refreshWhenVisible);
  }, []);

  useEffect(() => {
    let alive = true;
    const planWritesAtStart = planWriteVersion.current;
    (async () => {
      setLoading(true);
      const [plansRes, tasksRes, focusRes, dayNotesRes, contentItemsRes, contentSessionsRes, movieLookupRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id,title,scheduled_for,end_date,starts_at,ends_at,status,day_off")
          .lte("scheduled_for", range.end)
          .or(`scheduled_for.gte.${range.start},end_date.gte.${range.start}`)
          .order("scheduled_for", { ascending: true })
          .order("starts_at", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("tasks")
          .select("id,title,scheduled_for,status,sort_order")
          .gte("scheduled_for", range.start)
          .lte("scheduled_for", range.end)
          .order("scheduled_for", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("focuses")
          .select("id,title,scheduled_for,status,sort_order")
          .gte("scheduled_for", range.start)
          .lte("scheduled_for", range.end)
          .order("scheduled_for", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("day_notes")
          .select("note_date,notes")
          .gte("note_date", range.start)
          .lte("note_date", range.end),
        // All content items (need all for session title lookups, not just scheduled ones)
        supabase
          .from("content_items")
          .select("id,title,category,is_ongoing,status,scheduled_for"),
        // Content sessions (for ongoing items and movies)
        supabase
          .from("content_sessions")
          .select("id,content_item_id,movie_tracker_id,scheduled_for,status")
          .gte("scheduled_for", range.start)
          .lte("scheduled_for", range.end),
        // All movies for title lookup
        supabase
          .from("movie_tracker")
          .select("id,title"),
      ]);

      if (!alive) return;
      if (plansRes.error) console.error(plansRes.error);
      if (tasksRes.error) console.error(tasksRes.error);
      if (focusRes.error) console.error(focusRes.error);
      if (dayNotesRes.error) console.error(dayNotesRes.error);
      if (contentItemsRes.error) console.error(contentItemsRes.error);
      if (contentSessionsRes.error) console.error(contentSessionsRes.error);
      if (movieLookupRes.error) console.error(movieLookupRes.error);

      if (!plansRes.error && planWritesAtStart === planWriteVersion.current) {
        setPlans((plansRes.data ?? []) as Plan[]);
      }
      setTasks((tasksRes.data ?? []) as Task[]);
      setFocuses((focusRes.data ?? []) as Focus[]);
      setContentItems((contentItemsRes.data ?? []) as ContentItem[]);
      setContentSessions((contentSessionsRes.data ?? []) as ContentSession[]);

      // Build movie lookup map
      const allMovies = (movieLookupRes.data ?? []) as { id: string; title: string }[];
      const lookupMap = new Map<string, string>();
      for (const m of allMovies) {
        lookupMap.set(String(m.id), String(m.title ?? ""));
      }
      setMovieLookup(lookupMap);

      // Process day notes into a lookup by date
      const notesMap: Record<string, string> = {};
      for (const row of (dayNotesRes.data ?? []) as { note_date: string; notes: string }[]) {
        if (row.notes) notesMap[row.note_date] = row.notes;
      }
      setDayNotes(notesMap);

      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [range.start, range.end, refreshVersion]);

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
    // Sort each day's tasks by sort_order
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
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
    // Sort each day's focuses by sort_order
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return m;
  }, [focuses]);

  // Build content by day - combines one-off items (scheduled_for) and sessions
  type ContentEntry = { kind: "item"; item: ContentItem } | { kind: "session"; session: ContentSession };
  const contentByDay = useMemo(() => {
    const m: Record<string, ContentEntry[]> = {};
    // Add one-off content items (scheduled directly to a day)
    for (const item of contentItems) {
      if (!item.scheduled_for) continue;
      (m[item.scheduled_for] ||= []).push({ kind: "item", item });
    }
    // Add sessions (for ongoing items and movies)
    for (const session of contentSessions) {
      if (!session.scheduled_for) continue;
      (m[session.scheduled_for] ||= []).push({ kind: "session", session });
    }
    return m;
  }, [contentItems, contentSessions]);

  // Helper to get title for a content entry
  const getContentTitle = (entry: ContentEntry): string => {
    if (entry.kind === "item") {
      return entry.item.title;
    }
    // Session - look up from content_item or movie
    const session = entry.session;
    if (session.content_item_id) {
      const item = contentItems.find((i) => i.id === session.content_item_id);
      return item?.title ?? "Unknown";
    }
    if (session.movie_tracker_id) {
      return movieLookup.get(session.movie_tracker_id) ?? "Unknown Movie";
    }
    return "Unknown";
  };

  // Helper to check if content entry is done
  const isContentDone = (entry: ContentEntry): boolean => {
    if (entry.kind === "item") {
      return entry.item.status === "done";
    }
    return entry.session.status === "done";
  };

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
    const yearStartIso = `${visibleYear}-01-01`;
    const yearEndIso = `${visibleYear}-12-31`;

    return weeks.map((row) => {
      const weekStartIso = toISODate(row[0]);
      const weekEndIso = toISODate(row[6]);
      const spanStartBound = yearView ? isoMax(weekStartIso, yearStartIso) : weekStartIso;
      const spanEndBound = yearView ? isoMin(weekEndIso, yearEndIso) : weekEndIso;

      const raw: Omit<WeekSpan, "lane">[] = [];

      for (const p of multiDayPlans as Array<Plan & { _end: string }>) {
        const startIso = p.scheduled_for;
        const endIso = p._end;

        // No overlap
        if (endIso < spanStartBound || startIso > spanEndBound) continue;

        const segStart = isoMax(startIso, spanStartBound);
        const segEnd = isoMin(endIso, spanEndBound);

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
  }, [weeks, multiDayPlans, yearView, visibleYear]);

  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function monthLabelForWeek(row: Date[], weekIndex: number) {
    const monthStart = row.find((d) => d.getDate() === 1 && (!yearView || d.getFullYear() === visibleYear));

    if (weekIndex === 0) {
      // If the first visible week crosses into a new month, label the month
      // being entered instead of the partial month at the start of the row.
      if (monthStart) return fmtShortMonth(monthStart);
      const firstInView = yearView ? row.find((d) => d.getFullYear() === visibleYear) : row[0];
      return firstInView ? fmtShortMonth(firstInView) : "";
    }

    return monthStart ? fmtShortMonth(monthStart) : "";
  }

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
    const dayContent = contentByDay[iso] ?? [];
    const notes = dayNotes[iso] ?? "";

    return (
      <div className="w-[min(560px,92vw)] max-h-[80dvh] overflow-y-auto rounded-3xl border border-neutral-700/60 bg-neutral-950/98 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <button
            onClick={() => { setScheduleViewDate(iso); }}
            className="text-left hover:opacity-70 transition-opacity"
          >
            <div className="text-sm font-medium text-neutral-400">{fmtWeekday(d)}</div>
            <div className="text-xl font-semibold text-neutral-50 tracking-tight underline decoration-neutral-600 underline-offset-2">{fmtMonthDay(d)}</div>
          </button>
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

          {dayContent.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Content</div>
              <div className="space-y-1.5">
                {dayContent.map((entry) => {
                  const done = isContentDone(entry);
                  const title = getContentTitle(entry);
                  const key = entry.kind === "item" ? `item-${entry.item.id}` : `session-${entry.session.id}`;
                  return (
                    <div
                      key={key}
                      className={clsx(
                        "truncate text-sm font-medium",
                        done ? "text-emerald-400" : "text-neutral-50"
                      )}
                    >
                      {done ? "✓ " : ""}
                      {title}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {notes ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Notes</div>
              <div className="text-sm text-neutral-200 whitespace-pre-wrap max-h-[200px] overflow-y-auto">{notes}</div>
            </div>
          ) : null}

          {!notes && dayFocus.length === 0 && dayPlans.length === 0 && dayTasks.length === 0 && dayContent.length === 0 ? (
            <div className="text-sm text-neutral-400">Nothing scheduled.</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main className="h-full overflow-y-auto px-3 py-3 pb-[calc(100px+env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
      {/* Calendar view controls */}
      <div className="mx-auto mb-3 flex w-full max-w-[1200px] items-center justify-between gap-3">
        {yearView ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisibleYear((y) => y - 1)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-neutral-700 bg-neutral-900 text-lg font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
              aria-label="Previous year"
              title="Previous year"
            >
              ←
            </button>
            <div className="min-w-16 text-center text-lg font-semibold tracking-tight text-neutral-100">
              {visibleYear}
            </div>
            <button
              type="button"
              onClick={() => setVisibleYear((y) => y + 1)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-neutral-700 bg-neutral-900 text-lg font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
              aria-label="Next year"
              title="Next year"
            >
              →
            </button>
          </div>
        ) : (
          <div />
        )}
        <button
          onClick={() => {
            if (!yearView) {
              scrollToCurrentWeekRef.current = true;
              setVisibleYear(today.getFullYear());
            }
            setYearView((v) => !v);
          }}
          className={clsx(
            "rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
            yearView
              ? "border-neutral-200 bg-neutral-100 text-neutral-900"
              : "border-neutral-700 bg-neutral-900 text-neutral-200"
          )}
        >
          {yearView ? "Planner View" : "Year View"}
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="flex shadow-sm">
          <div className="grid flex-1 grid-cols-7">
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
          <div className="w-7 shrink-0 border-b border-neutral-700/50 sm:w-8" />
        </div>

        {/* Week grid */}
        <div className="border-b border-neutral-700/50 shadow-lg">
          <div>
            {weeks.map((row, wIdx) => {
              const monthLabel = monthLabelForWeek(row, wIdx);
              const isCurrentWeek = toISODate(row[0]) === toISODate(week0);
              const spans = spansByWeek[wIdx];
              const laneCount = spans.reduce((count, span) => Math.max(count, span.lane + 1), 0);
              const barHeight = isWide ? 20 : 12;
              const laneHeight = barHeight + 2;
              const planBarSpace = laneCount ? 6 + laneCount * laneHeight : 0;

              return (
                <div
                  key={`week-${wIdx}`}
                  ref={yearView && isCurrentWeek ? currentWeekRowRef : undefined}
                  className="flex"
                >
                  <div className="@container relative min-w-0 flex-1 border-l border-neutral-700/50">
                  <div className="grid grid-cols-7">
                    {row.map((d, dIdx) => {
                      const iso = toISODate(d);
                      const isInVisibleYear = !yearView || d.getFullYear() === visibleYear;
                      const isToday = iso === todayIso;
                      const dayPlans = plansByDay[iso] ?? [];
                      const weekend = isWeekend(d);
                      const dayOff = !!dayOffByDay[iso];

                      const monthChangeFromTop =
                        wIdx > 0 && weeks[wIdx - 1][dIdx].getMonth() !== d.getMonth();
                      const monthChangeFromLeft =
                        dIdx > 0 && row[dIdx - 1].getMonth() !== d.getMonth();

                      if (!isInVisibleYear) {
                        return (
                          <div
                            key={iso}
                            className={clsx(
                              "relative min-h-[calc(100cqw/7)] select-none bg-neutral-950/10 p-1",
                              dIdx === 6 ? "border-r-0" : "border-r border-r-neutral-700/40",
                              monthChangeFromTop ? "border-t-2 border-t-neutral-500/70" : "border-t border-t-neutral-700/40",
                              monthChangeFromLeft ? "border-l-2 border-l-neutral-500/70" : ""
                            )}
                          />
                        );
                      }

                      return (
                        <DayCell
                          key={iso}
                          d={d}
                          iso={iso}
                          isToday={isToday}
                          dayPlans={dayPlans}
                          maxPlansPerCell={maxPlansPerCell}
                          planBarSpace={planBarSpace}
                          weekend={weekend}
                          dayOff={dayOff}
                          monthChangeFromTop={monthChangeFromTop}
                          monthChangeFromLeft={monthChangeFromLeft}
                          dIdx={dIdx}
                          onOpenDay={setOpenIso}
                        />
                      );
                    })}
                  </div>
                  {/* Multi-day plan bars */}
                  {laneCount > 0 ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-1 z-10 grid grid-cols-7" style={{ gridAutoRows: laneHeight }}>
                      {spans.map((s) => {
                        return (
                          <div
                            key={s.key}
                            style={{ gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`, gridRow: laneCount - s.lane }}
                            className="min-w-0 self-end px-1"
                          >
                            <div
                              style={{ height: barHeight }}
                              className={clsx(
                                "flex w-full items-center border border-neutral-200/30 bg-neutral-200/10 font-medium leading-none text-neutral-100 backdrop-blur shadow-sm",
                                isWide
                                  ? "rounded-md px-1.5 text-[11px]"
                                  : "rounded-sm px-1 text-[8px]"
                              )}
                            >
                              <div className="flex w-full items-center justify-center gap-1 overflow-hidden">
                                {s.continuesLeft ? (
                                  <span className={clsx("shrink-0", isWide ? "text-neutral-200/80" : "text-neutral-200/60")}>←</span>
                                ) : null}
                                <span
                                  className="min-w-0 truncate text-center"
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
                  <div className="w-7 shrink-0 border-l border-neutral-700/50 pt-2 text-center text-[10px] font-semibold uppercase tracking-normal text-neutral-500 sm:w-8 sm:text-xs">
                    {monthLabel}
                  </div>
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

      {/* Day Schedule View */}
      {scheduleViewDate && <DayScheduleView
        key={scheduleViewDate}
        layer="z-[130]"
        date={scheduleViewDate}
        dateLabel={(() => {
          if (scheduleViewDate === todayIso) return 'Today';
          const tmrw = addDays(today, 1);
          if (scheduleViewDate === toISODate(tmrw)) return 'Tomorrow';
          const d = new Date(scheduleViewDate + 'T00:00:00');
          return d.toLocaleDateString(undefined, { weekday: 'long' });
        })()}
        items={scheduleItems}
        plans={plans}
        onClose={() => { setScheduleViewDate(null); setScheduleItems([]); }}
        onCreateItem={createScheduleItem}
        onUpdateItem={updateScheduleItem}
        onDeleteItem={deleteScheduleItem}
        onUpdatePlanTime={async (id, endsAtTime) => {
          const plan = plans.find((item) => item.id === id);
          if (!plan?.starts_at || !plan.scheduled_for) return;
          try {
            const times = resizePlanEnd(plan, endsAtTime);
            const { data, error } = await supabase.from("plans").update(times)
              .eq("id", id).eq("scheduled_for", plan.scheduled_for).eq("starts_at", plan.starts_at)
              .select("starts_at,ends_at").single();
            if (error) throw error;
            planWriteVersion.current += 1;
            setPlans((previous) => previous.map((item) => item.id === id ? { ...item, ...data } : item));
          } catch (error) {
            const message = error && typeof error === "object" && "message" in error ? String(error.message) : "Try again.";
            window.alert(`Could not change the end time. ${message}`);
          }
        }}
      />}
    </main>
  );
}
