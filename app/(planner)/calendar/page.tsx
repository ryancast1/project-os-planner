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
  ends_at?: string | null;
  status?: string | null;
  day_off?: boolean | null;
};

type DayScheduleItem = {
  id: string;
  user_id: string;
  scheduled_date: string;
  title: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
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

function DayCell({
  d,
  iso,
  isToday,
  dayPlans,
  maxPlansPerCell,
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
}

// --- Day Schedule View helpers and components ---

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatTimeDisplay(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'am' : 'pm';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function parseTimeInput(input: string): string | null {
  const cleaned = input.toLowerCase().trim();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const ampm = match[3];
  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function ScheduleItemBlock({
  item, position, onOpenEditModal, onResize, pixelsPerHour, siblingItems, column,
}: {
  item: DayScheduleItem;
  position: { top: number; height: number };
  onOpenEditModal: () => void;
  onResize: (newEndTime: string) => void;
  pixelsPerHour: number;
  siblingItems: DayScheduleItem[];
  column: 'left' | 'right';
}) {
  const [localHeight, setLocalHeight] = useState(position.height);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const localHeightRef = useRef(localHeight);
  localHeightRef.current = localHeight;

  useEffect(() => { if (!isResizing) setLocalHeight(position.height); }, [position.height, isResizing]);

  const maxHeight = useMemo(() => {
    const itemStartMinutes = timeToMinutes(item.starts_at);
    let nextStart = Infinity;
    for (const sibling of siblingItems) {
      const siblingStart = timeToMinutes(sibling.starts_at);
      if (siblingStart > itemStartMinutes && siblingStart < nextStart) nextStart = siblingStart;
    }
    if (nextStart === Infinity) return Infinity;
    return ((nextStart - itemStartMinutes) / 60) * pixelsPerHour;
  }, [item.starts_at, siblingItems, pixelsPerHour]);

  const maxHeightRef = useRef(maxHeight);
  maxHeightRef.current = maxHeight;

  const handleResizeStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeRef.current = { startY: clientY, startHeight: localHeightRef.current };
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!resizeRef.current) return;
      e.preventDefault();
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - resizeRef.current.startY;
      const mh = maxHeightRef.current;
      let newHeight = Math.max(pixelsPerHour / 4, resizeRef.current.startHeight + deltaY);
      if (mh !== Infinity) newHeight = Math.min(newHeight, mh);
      const snapSize = pixelsPerHour / 4;
      const snappedHeight = Math.round(newHeight / snapSize) * snapSize;
      setLocalHeight(Math.min(snappedHeight, mh === Infinity ? snappedHeight : mh));
    };
    const handleEnd = () => {
      if (!resizeRef.current) return;
      const finalHeight = localHeightRef.current;
      const durationMinutes = (finalHeight / pixelsPerHour) * 60;
      const [startH, startM] = item.starts_at.split(':').map(Number);
      const endMinutes = startH * 60 + startM + durationMinutes;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      onResize(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);
      resizeRef.current = null;
      setIsResizing(false);
    };
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('mouseup', handleEnd);
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [isResizing, item.starts_at, onResize, pixelsPerHour]);

  return (
    <div
      className={`absolute left-1 right-1 rounded-lg bg-neutral-800 overflow-hidden select-none ${
        column === 'left' ? 'border-l-4 border-green-400' : 'border-r-4 border-green-400'
      }`}
      style={{ top: position.top, height: localHeight, minHeight: pixelsPerHour / 4 }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onOpenEditModal(); }}
      onTouchStart={() => { longPressTimerRef.current = window.setTimeout(() => onOpenEditModal(), 500); }}
      onTouchEnd={() => { if (longPressTimerRef.current) { window.clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
      onTouchMove={() => { if (longPressTimerRef.current) { window.clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
    >
      <div className="px-2 py-1">
        <div className="text-sm text-neutral-100 truncate text-center">{item.title}</div>
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize touch-none bg-gradient-to-t from-neutral-700/40"
        onTouchStart={handleResizeStart}
        onMouseDown={handleResizeStart}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ScheduleEditModal({
  item, onSave, onDelete, onClose,
}: {
  item: DayScheduleItem;
  onSave: (updates: { title: string; starts_at: string; ends_at: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [startTime, setStartTime] = useState(formatTimeDisplay(item.starts_at));
  const [endTime, setEndTime] = useState(formatTimeDisplay(item.ends_at));
  const [timeError, setTimeError] = useState<string | null>(null);

  const handleSave = () => {
    if (!title.trim()) return;
    const parsedStart = parseTimeInput(startTime);
    const parsedEnd = parseTimeInput(endTime);
    if (!parsedStart || !parsedEnd) { setTimeError('Invalid time format. Use h:mm am/pm (e.g., 3:30 pm)'); return; }
    if (parsedStart >= parsedEnd) { setTimeError('Start time must be before end time'); return; }
    onSave({ title: title.trim(), starts_at: parsedStart, ends_at: parsedEnd });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
        <div className="mb-3 text-lg font-semibold text-neutral-100">Edit Item</div>
        <input
          autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-[16px] text-neutral-100 outline-none focus:border-neutral-500"
          placeholder="Event title..."
        />
        <div className="mt-3 flex gap-2 items-center">
          <div className="flex-1">
            <label className="text-xs text-neutral-500 mb-1 block">Start</label>
            <input value={startTime} onChange={(e) => { setStartTime(e.target.value); setTimeError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-[16px] text-neutral-100 outline-none focus:border-neutral-500" placeholder="3:00 pm" />
          </div>
          <div className="text-neutral-500 pt-5">{'\u2192'}</div>
          <div className="flex-1">
            <label className="text-xs text-neutral-500 mb-1 block">End</label>
            <input value={endTime} onChange={(e) => { setEndTime(e.target.value); setTimeError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-[16px] text-neutral-100 outline-none focus:border-neutral-500" placeholder="4:00 pm" />
          </div>
        </div>
        {timeError && <div className="mt-2 text-xs text-red-400">{timeError}</div>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => { onDelete(); onClose(); }} className="rounded-xl border border-red-700 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-900/30">Delete</button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800">Cancel</button>
          <button type="button" onClick={handleSave} className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900">Save</button>
        </div>
      </div>
    </div>
  );
}

function CalPlanItemBlock({
  plan, position, onResize, pixelsPerHour, siblingItems, column,
}: {
  plan: { id: string; title: string; starts_at: string; ends_at: string; isPlan: true; hasEndTime: boolean };
  position: { top: number; height: number };
  onResize: (newEndTime: string) => void;
  pixelsPerHour: number;
  siblingItems: { starts_at: string; ends_at: string }[];
  column: 'left' | 'right';
}) {
  const [localHeight, setLocalHeight] = useState(position.height);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const localHeightRef = useRef(localHeight);
  localHeightRef.current = localHeight;

  useEffect(() => { if (!isResizing) setLocalHeight(position.height); }, [position.height, isResizing]);

  const maxHeight = useMemo(() => {
    const itemStartMinutes = timeToMinutes(plan.starts_at);
    let nextStart = Infinity;
    for (const sibling of siblingItems) {
      const siblingStart = timeToMinutes(sibling.starts_at);
      if (siblingStart > itemStartMinutes && siblingStart < nextStart) nextStart = siblingStart;
    }
    if (nextStart === Infinity) return Infinity;
    return ((nextStart - itemStartMinutes) / 60) * pixelsPerHour;
  }, [plan.starts_at, siblingItems, pixelsPerHour]);

  const maxHeightRef = useRef(maxHeight);
  maxHeightRef.current = maxHeight;

  const handleResizeStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeRef.current = { startY: clientY, startHeight: localHeightRef.current };
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!resizeRef.current) return;
      e.preventDefault();
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - resizeRef.current.startY;
      const mh = maxHeightRef.current;
      let newHeight = Math.max(pixelsPerHour / 4, resizeRef.current.startHeight + deltaY);
      if (mh !== Infinity) newHeight = Math.min(newHeight, mh);
      const snapSize = pixelsPerHour / 4;
      const snappedHeight = Math.round(newHeight / snapSize) * snapSize;
      setLocalHeight(Math.min(snappedHeight, mh === Infinity ? snappedHeight : mh));
    };
    const handleEnd = () => {
      if (!resizeRef.current) return;
      const finalHeight = localHeightRef.current;
      const durationMinutes = (finalHeight / pixelsPerHour) * 60;
      const [startH, startM] = plan.starts_at.split(':').map(Number);
      const endMinutes = startH * 60 + startM + durationMinutes;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      onResize(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);
      resizeRef.current = null;
      setIsResizing(false);
    };
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('mouseup', handleEnd);
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [isResizing, plan.starts_at, onResize, pixelsPerHour]);

  return (
    <div
      className={`absolute left-1 right-1 rounded-lg bg-neutral-700/50 overflow-hidden select-none ${
        column === 'left' ? 'border-l-4 border-blue-400' : 'border-r-4 border-blue-400'
      }`}
      style={{ top: position.top, height: localHeight, minHeight: pixelsPerHour / 4 }}
    >
      <div className="px-2 py-1">
        <div className="text-sm text-neutral-200 truncate text-center">{plan.title}</div>
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize touch-none bg-gradient-to-t from-neutral-600/40"
        onTouchStart={handleResizeStart}
        onMouseDown={handleResizeStart}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function CalDayScheduleView({
  open, date, dateLabel, items, plans, onClose, onCreateItem, onUpdateItem, onDeleteItem, onUpdatePlanTime,
}: {
  open: boolean;
  date: string;
  dateLabel: string;
  items: DayScheduleItem[];
  plans: Plan[];
  onClose: () => void;
  onCreateItem: (item: { title: string; starts_at: string; ends_at: string }) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<DayScheduleItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onUpdatePlanTime: (id: string, ends_at: string) => Promise<void>;
}) {
  const LEFT_START_HOUR = 7;
  const RIGHT_START_HOUR = 15;
  const HOURS_PER_COLUMN = 8;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    if (!open) return;
    const updateHeight = () => { if (containerRef.current) setContainerHeight(containerRef.current.clientHeight); };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [open]);

  const PIXELS_PER_HOUR = containerHeight > 0 ? containerHeight / HOURS_PER_COLUMN : 80;
  const COLUMN_HEIGHT = containerHeight > 0 ? containerHeight : HOURS_PER_COLUMN * 80;

  const leftHours = Array.from({ length: 8 }, (_, i) => LEFT_START_HOUR + i);
  const rightHours = Array.from({ length: 8 }, (_, i) => RIGHT_START_HOUR + i);

  const leftItems = items.filter(item => { const hour = parseInt(item.starts_at.split(':')[0]); return hour >= 7 && hour < 15; });
  const rightItems = items.filter(item => { const hour = parseInt(item.starts_at.split(':')[0]); return hour >= 15 && hour < 23; });

  const plansWithTime = useMemo(() => {
    return plans
      .filter(p => p.starts_at && (p.status === 'open' || !p.status))
      .map(p => {
        const startsAtDate = new Date(p.starts_at!);
        const startHour = startsAtDate.getHours();
        const startMin = startsAtDate.getMinutes();
        const startsAtTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
        let endsAtTime: string;
        if (p.ends_at) {
          const endsAtDate = new Date(p.ends_at);
          endsAtTime = `${String(endsAtDate.getHours()).padStart(2, '0')}:${String(endsAtDate.getMinutes()).padStart(2, '0')}:00`;
        } else {
          endsAtTime = `${String(startHour + 1).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
        }
        return { id: p.id, title: p.title, starts_at: startsAtTime, ends_at: endsAtTime, isPlan: true as const, hasEndTime: !!p.ends_at };
      });
  }, [plans]);

  const leftPlans = plansWithTime.filter(p => { const hour = parseInt(p.starts_at.split(':')[0]); return hour >= 7 && hour < 15; });
  const rightPlans = plansWithTime.filter(p => { const hour = parseInt(p.starts_at.split(':')[0]); return hour >= 15 && hour < 23; });

  const [addingAt, setAddingAt] = useState<{ time: string; column: 'left' | 'right'; duration: number } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [editingItem, setEditingItem] = useState<DayScheduleItem | null>(null);

  const [draggingNew, setDraggingNew] = useState<{
    column: 'left' | 'right'; startY: number; startTime: string; startMinutes: number; currentHeight: number; maxHeight: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pendingDragRef = useRef<{
    column: 'left' | 'right'; startY: number; startTime: string; startMinutes: number; maxMinutes: number;
  } | null>(null);

  const now = useMemo(() => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (date !== todayStr) return null;
    const h = d.getHours();
    const m = d.getMinutes();
    const totalMinutes = h * 60 + m;
    if (h >= LEFT_START_HOUR && h < RIGHT_START_HOUR) {
      return { column: 'left' as const, top: ((totalMinutes - LEFT_START_HOUR * 60) / 60) * PIXELS_PER_HOUR };
    } else if (h >= RIGHT_START_HOUR && h < 23) {
      return { column: 'right' as const, top: ((totalMinutes - RIGHT_START_HOUR * 60) / 60) * PIXELS_PER_HOUR };
    }
    return null;
  }, [PIXELS_PER_HOUR, date]);

  const getPosition = (startsAt: string, endsAt: string, columnStartHour: number) => {
    const [startH, startM] = startsAt.split(':').map(Number);
    const [endH, endM] = endsAt.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const columnStartMinutes = columnStartHour * 60;
    const top = ((startMinutes - columnStartMinutes) / 60) * PIXELS_PER_HOUR;
    const height = Math.max(PIXELS_PER_HOUR / 4, ((endMinutes - startMinutes) / 60) * PIXELS_PER_HOUR);
    return { top, height };
  };

  const getPositionForTime = (timeStr: string, columnStartHour: number) => {
    const [h, m] = timeStr.split(':').map(Number);
    return (((h * 60 + m) - columnStartHour * 60) / 60) * PIXELS_PER_HOUR;
  };

  const getMaxMinutes = (startMinutes: number, column: 'left' | 'right') => {
    const colItems = column === 'left' ? leftItems : rightItems;
    const colPlans = column === 'left' ? leftPlans : rightPlans;
    const columnEndMinutes = column === 'left' ? RIGHT_START_HOUR * 60 : 23 * 60;
    let nextItemStart = columnEndMinutes;
    for (const existingItem of colItems) {
      const s = timeToMinutes(existingItem.starts_at);
      if (s > startMinutes && s < nextItemStart) nextItemStart = s;
    }
    for (const existingPlan of colPlans) {
      const s = timeToMinutes(existingPlan.starts_at);
      if (s > startMinutes && s < nextItemStart) nextItemStart = s;
    }
    return nextItemStart - startMinutes;
  };

  const isTimeBlocked = (minutes: number, column: 'left' | 'right') => {
    const colItems = column === 'left' ? leftItems : rightItems;
    const colPlans = column === 'left' ? leftPlans : rightPlans;
    for (const existingItem of colItems) {
      const s = timeToMinutes(existingItem.starts_at);
      const e = timeToMinutes(existingItem.ends_at);
      if (minutes >= s && minutes < e) return true;
    }
    for (const existingPlan of colPlans) {
      const s = timeToMinutes(existingPlan.starts_at);
      const e = timeToMinutes(existingPlan.ends_at);
      if (minutes >= s && minutes < e) return true;
    }
    return false;
  };

  const handlePointerDown = (e: React.PointerEvent, column: 'left' | 'right') => {
    if (addingAt || draggingNew) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const columnStartHour = column === 'left' ? LEFT_START_HOUR : RIGHT_START_HOUR;
    const minutesFromColumnStart = Math.floor((y / PIXELS_PER_HOUR) * 60);
    const snappedMinutes = Math.floor(minutesFromColumnStart / 15) * 15;
    const totalMinutes = columnStartHour * 60 + snappedMinutes;
    if (isTimeBlocked(totalMinutes, column)) return;
    const maxMinutes = getMaxMinutes(totalMinutes, column);
    if (maxMinutes < 15) return;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
    pendingDragRef.current = { column, startY: y, startTime: timeStr, startMinutes: totalMinutes, maxMinutes };
    longPressTimerRef.current = window.setTimeout(() => {
      if (pendingDragRef.current) {
        const { column: c, startY: sY, startTime: sT, startMinutes: sM, maxMinutes: mM } = pendingDragRef.current;
        setDraggingNew({ column: c, startY: sY, startTime: sT, startMinutes: sM, currentHeight: PIXELS_PER_HOUR / 4, maxHeight: (mM / 60) * PIXELS_PER_HOUR });
      }
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent, column: 'left' | 'right') => {
    if (!draggingNew || draggingNew.column !== column) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const deltaY = y - draggingNew.startY;
    const minHeight = PIXELS_PER_HOUR / 4;
    let newHeight = Math.max(minHeight, deltaY);
    newHeight = Math.min(newHeight, draggingNew.maxHeight);
    const snapSize = PIXELS_PER_HOUR / 4;
    const snappedHeight = Math.round(newHeight / snapSize) * snapSize;
    setDraggingNew(prev => prev ? { ...prev, currentHeight: Math.max(minHeight, snappedHeight) } : null);
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) { window.clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (draggingNew) {
      const durationMinutes = Math.round((draggingNew.currentHeight / PIXELS_PER_HOUR) * 60);
      setAddingAt({ time: draggingNew.startTime, column: draggingNew.column, duration: durationMinutes });
      setInputValue("");
      setDraggingNew(null);
    }
    pendingDragRef.current = null;
  };

  const handlePointerCancel = () => {
    if (longPressTimerRef.current) { window.clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    setDraggingNew(null);
    pendingDragRef.current = null;
  };

  useEffect(() => { return () => { if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current); }; }, []);

  const formatHour = (h: number) => { if (h === 12) return '12'; if (h < 12) return `${h}`; return `${h - 12}`; };

  if (!open) return null;

  const renderColumn = (
    column: 'left' | 'right',
    hours: number[],
    colItems: DayScheduleItem[],
    colPlans: typeof plansWithTime,
    startHour: number,
  ) => (
    <div
      className="flex-1 relative touch-none"
      style={{ height: COLUMN_HEIGHT }}
      onPointerDown={(e) => handlePointerDown(e, column)}
      onPointerMove={(e) => handlePointerMove(e, column)}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
    >
      {hours.map((h, i) => (
        <div key={h} className="absolute left-0 right-0 border-t border-neutral-800" style={{ top: i * PIXELS_PER_HOUR }} />
      ))}
      <div className="absolute left-0 right-0 border-t border-neutral-800" style={{ top: COLUMN_HEIGHT }} />
      {colItems.map(item => (
        <ScheduleItemBlock
          key={item.id} item={item}
          position={getPosition(item.starts_at, item.ends_at, startHour)}
          onOpenEditModal={() => setEditingItem(item)}
          onResize={(newEnd) => onUpdateItem(item.id, { ends_at: newEnd })}
          pixelsPerHour={PIXELS_PER_HOUR}
          siblingItems={colItems.filter(i => i.id !== item.id)}
          column={column}
        />
      ))}
      {colPlans.map(plan => (
        <CalPlanItemBlock
          key={`plan-${plan.id}`} plan={plan}
          position={getPosition(plan.starts_at, plan.ends_at, startHour)}
          onResize={(newEnd) => onUpdatePlanTime(plan.id, newEnd)}
          pixelsPerHour={PIXELS_PER_HOUR}
          siblingItems={[...colItems, ...colPlans.filter(p => p.id !== plan.id)]}
          column={column}
        />
      ))}
      {now?.column === column && (
        <div className="absolute left-0 right-0 border-t border-red-500 pointer-events-none z-10" style={{ top: now.top }} />
      )}
      {draggingNew?.column === column && (
        <div
          className="absolute left-1 right-1 bg-green-500/30 border border-green-400 rounded pointer-events-none z-20"
          style={{ top: getPositionForTime(draggingNew.startTime, startHour), height: draggingNew.currentHeight }}
        />
      )}
      {addingAt?.column === column && (
        <div
          className="absolute left-1 right-1 bg-neutral-900 border border-neutral-700 rounded z-20 shadow-xl"
          style={{ top: getPositionForTime(addingAt.time, startHour), height: (addingAt.duration / 60) * PIXELS_PER_HOUR }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputValue.trim()) {
                const [h, m] = addingAt.time.split(':').map(Number);
                const totalMins = h * 60 + m + addingAt.duration;
                const endH = Math.floor(totalMins / 60);
                const endM = totalMins % 60;
                onCreateItem({ title: inputValue.trim(), starts_at: addingAt.time, ends_at: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00` });
                setAddingAt(null); setInputValue("");
              }
              if (e.key === 'Escape') { setAddingAt(null); setInputValue(""); }
            }}
            onBlur={() => {
              if (inputValue.trim() && addingAt) {
                const [h, m] = addingAt.time.split(':').map(Number);
                const totalMins = h * 60 + m + addingAt.duration;
                const endH = Math.floor(totalMins / 60);
                const endM = totalMins % 60;
                onCreateItem({ title: inputValue.trim(), starts_at: addingAt.time, ends_at: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00` });
              }
              setAddingAt(null); setInputValue("");
            }}
            placeholder="Event title..."
            className="w-full h-full px-2 bg-transparent text-neutral-100 outline-none text-[16px] text-center"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[130] bg-neutral-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div>
          <div className="text-lg font-semibold text-neutral-100">{dateLabel}</div>
          <div className="text-xs text-neutral-400">
            {date ? new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : ''}
          </div>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-200 text-2xl p-2">{'\u00D7'}</button>
      </div>
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex">
          <div className="w-8 shrink-0 relative" style={{ height: COLUMN_HEIGHT }}>
            {leftHours.map((h, i) => (
              <div key={h} className="absolute right-1 text-xs text-neutral-500 leading-none" style={{ top: i === 0 ? i * PIXELS_PER_HOUR + 2 : i * PIXELS_PER_HOUR - 5 }}>{formatHour(h)}</div>
            ))}
            <div className="absolute right-1 text-xs text-neutral-500 leading-none" style={{ top: COLUMN_HEIGHT - 12 }}>3</div>
          </div>
          {renderColumn('left', leftHours, leftItems, leftPlans, LEFT_START_HOUR)}
          <div className="w-px bg-neutral-700" />
        </div>
        <div className="flex-1 flex">
          {renderColumn('right', rightHours, rightItems, rightPlans, RIGHT_START_HOUR)}
          <div className="w-8 shrink-0 relative" style={{ height: COLUMN_HEIGHT }}>
            {rightHours.map((h, i) => (
              <div key={h} className="absolute left-1 text-xs text-neutral-500 leading-none" style={{ top: i === 0 ? i * PIXELS_PER_HOUR + 2 : i * PIXELS_PER_HOUR - 5 }}>{formatHour(h)}</div>
            ))}
            <div className="absolute left-1 text-xs text-neutral-500 leading-none" style={{ top: COLUMN_HEIGHT - 12 }}>11</div>
          </div>
        </div>
      </div>
      {editingItem && (
        <ScheduleEditModal item={editingItem}
          onSave={(updates) => onUpdateItem(editingItem.id, updates)}
          onDelete={() => onDeleteItem(editingItem.id)}
          onClose={() => setEditingItem(null)}
        />
      )}
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

  // App start date - January 12, 2026
  const appStartDate = useMemo(() => new Date(2026, 0, 12), []);
  const appStartWeek = useMemo(() => startOfWeekMonday(appStartDate), [appStartDate]);

  const [showPast, setShowPast] = useState(false);

  // Calculate how many past weeks to show (from app start to last week)
  const pastWeeksCount = useMemo(() => {
    const diffMs = week0.getTime() - appStartWeek.getTime();
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.max(0, diffWeeks);
  }, [week0, appStartWeek]);

  // Index where current week starts (0 if not showing past, pastWeeksCount if showing past)
  const currentWeekIndex = showPast ? pastWeeksCount : 0;

  const weeks = useMemo(() => {
    const out: Date[][] = [];

    // Add past weeks if showing past
    if (showPast && pastWeeksCount > 0) {
      for (let w = 0; w < pastWeeksCount; w++) {
        const row: Date[] = [];
        const start = addDays(appStartWeek, w * 7);
        for (let i = 0; i < 7; i++) row.push(addDays(start, i));
        out.push(row);
      }
    }

    // Add current week + next 12 weeks (13 total future weeks)
    for (let w = 0; w < 13; w++) {
      const row: Date[] = [];
      const start = addDays(week0, w * 7);
      for (let i = 0; i < 7; i++) row.push(addDays(start, i));
      out.push(row);
    }
    return out;
  }, [week0, showPast, pastWeeksCount, appStartWeek]);

  const range = useMemo(() => {
    const start = toISODate(weeks[0][0]);
    const end = toISODate(weeks[weeks.length - 1][6]);
    return { start, end };
  }, [weeks]);

  const todayIso = useMemo(() => toISODate(today), [today]);

  const [plans, setPlans] = useState<Plan[]>([]);
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
    let alive = true;
    (async () => {
      setLoading(true);
      const [plansRes, tasksRes, focusRes, dayNotesRes, contentItemsRes, contentSessionsRes, movieLookupRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id,title,scheduled_for,end_date,starts_at,ends_at,status,day_off")
          .gte("scheduled_for", range.start)
          .lte("scheduled_for", range.end)
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

      setPlans((plansRes.data ?? []) as Plan[]);
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
      {/* Show Past button */}
      <div className="mx-auto w-full max-w-[1200px] mb-3 flex justify-end">
        <button
          onClick={() => setShowPast((s) => !s)}
          className={clsx(
            "rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
            showPast
              ? "border-neutral-200 bg-neutral-100 text-neutral-900"
              : "border-neutral-700 bg-neutral-900 text-neutral-200"
          )}
        >
          {showPast ? "Hide Past" : "Show Past"}
        </button>
      </div>

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

        {/* Week grid */}
        <div className="border-x border-b border-neutral-700/50 shadow-lg">
          <div>
            {weeks.map((row, wIdx) => {
              // Show divider before current week when viewing past
              const isCurrentWeekStart = showPast && wIdx === currentWeekIndex;

              return (
                <div key={`week-${wIdx}`}>
                  {/* Divider between past and current week */}
                  {isCurrentWeekStart && (
                    <div className="h-1.5 bg-neutral-500/80" />
                  )}
                  <div className="relative">
                  <div className="grid grid-cols-7">
                    {row.map((d, dIdx) => {
                      const iso = toISODate(d);
                      const isToday = iso === todayIso;
                      const dayPlans = plansByDay[iso] ?? [];
                      const weekend = isWeekend(d);
                      const dayOff = !!dayOffByDay[iso];

                      const monthChangeFromTop =
                        wIdx > 0 && weeks[wIdx - 1][dIdx].getMonth() !== d.getMonth() && !isCurrentWeekStart;
                      const monthChangeFromLeft =
                        dIdx > 0 && row[dIdx - 1].getMonth() !== d.getMonth();

                      return (
                        <DayCell
                          key={iso}
                          d={d}
                          iso={iso}
                          isToday={isToday}
                          dayPlans={dayPlans}
                          maxPlansPerCell={maxPlansPerCell}
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
      <CalDayScheduleView
        open={!!scheduleViewDate}
        date={scheduleViewDate ?? ''}
        dateLabel={scheduleViewDate ? (() => {
          if (scheduleViewDate === todayIso) return 'Today';
          const tmrw = addDays(today, 1);
          if (scheduleViewDate === toISODate(tmrw)) return 'Tomorrow';
          const d = new Date(scheduleViewDate + 'T00:00:00');
          return d.toLocaleDateString(undefined, { weekday: 'long' });
        })() : ''}
        items={scheduleItems}
        plans={scheduleViewDate ? plans.filter(p => p.scheduled_for === scheduleViewDate) : []}
        onClose={() => { setScheduleViewDate(null); setScheduleItems([]); }}
        onCreateItem={createScheduleItem}
        onUpdateItem={updateScheduleItem}
        onDeleteItem={deleteScheduleItem}
        onUpdatePlanTime={async (id, endsAtTime) => {
          const plan = plans.find(p => p.id === id);
          if (!plan || !plan.starts_at) return;
          const startsAtDate = new Date(plan.starts_at);
          const [endH, endM] = endsAtTime.split(':').map(Number);
          const endsAtDate = new Date(startsAtDate);
          endsAtDate.setHours(endH, endM, 0, 0);
          const { error } = await supabase
            .from('plans')
            .update({ ends_at: endsAtDate.toISOString() })
            .eq('id', id);
          if (!error) {
            setPlans(prev => prev.map(p =>
              p.id === id ? { ...p, ends_at: endsAtDate.toISOString() } : p
            ));
          }
        }}
      />
    </main>
  );
}