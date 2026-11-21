"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { planTimelineTimes } from "@/lib/planSchedule";

export type DayScheduleItem = {
  id: string;
  user_id: string;
  scheduled_date: string;
  title: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
};

type SchedulePlan = Parameters<typeof planTimelineTimes>[0] & {
  id: string;
  title: string;
  status?: string | null;
};

type TimeRange = { start: number; end: number };
type TimeFields = Pick<DayScheduleItem, "title" | "starts_at" | "ends_at">;
type TimelineBlock = TimeRange & {
  key: string;
  title: string;
  item?: DayScheduleItem;
  saveEnd?: (end: string) => Promise<void>;
};

const STEP = 15;
const COLUMN_LENGTH = 8 * 60;
const COLUMN_STARTS = [7 * 60, 15 * 60] as const;
const DAY_END = COLUMN_STARTS[1] + COLUMN_LENGTH;
type Column = 0 | 1;

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total: number) {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:00`;
}

function segmentInColumn(range: TimeRange, columnStart: number) {
  const start = Math.max(range.start, columnStart);
  const end = Math.min(range.end, columnStart + COLUMN_LENGTH);
  if (end <= start) return null;
  return {
    top: `${(start - columnStart) / COLUMN_LENGTH * 100}%`,
    height: `${(end - start) / COLUMN_LENGTH * 100}%`,
    minutes: end - start,
    isStart: start === range.start,
    isEnd: end === range.end,
  };
}

type Drag = {
  pointerId: number;
  originX: number;
  originY: number;
  originColumn: Column;
  column: Column;
  endOffset: number;
  start: number;
  end: number;
  maxEnd: number;
} & (
  | { kind: "create"; ready: boolean }
  | { kind: "resize"; block: TimelineBlock }
);

function ScheduleBlock({
  block, segment, multiline, column, height, onEdit, onResize,
}: {
  block: TimelineBlock;
  segment: NonNullable<ReturnType<typeof segmentInColumn>>;
  multiline: boolean;
  column: Column;
  height: number;
  onEdit: () => void;
  onResize?: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const editTimer = useRef<number | undefined>(undefined);
  const clearEditTimer = () => window.clearTimeout(editTimer.current);
  useEffect(() => () => window.clearTimeout(editTimer.current), []);
  const compact = multiline && height < 32;
  const lines = Math.max(1, Math.floor(height / (compact ? 12 : 16)));

  return (
    <div
      className={`absolute inset-x-1 grid place-items-center overflow-hidden rounded-lg select-none px-2 ${
        block.item ? "bg-neutral-800 text-neutral-100 border-green-400" : "bg-neutral-700/50 text-neutral-200 border-blue-400"
      } ${column === 0 ? "border-l-4" : "border-r-4"}`}
      style={{ top: segment.top, height: segment.height }}
      data-schedule-block
      onContextMenu={(event) => {
        event.preventDefault();
        clearEditTimer();
        if (block.item && !(event.target as Element).closest("[data-resize-handle]")) onEdit();
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" || !event.isPrimary || !block.item) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        clearEditTimer();
        editTimer.current = window.setTimeout(onEdit, 500);
      }}
      onPointerUp={clearEditTimer}
      onPointerCancel={clearEditTimer}
      onLostPointerCapture={clearEditTimer}
      onPointerMove={clearEditTimer}
    >
      <div
        className={`w-full min-w-0 text-center ${compact ? "text-xs leading-3" : "text-sm leading-4"} ${
          multiline ? "line-clamp-2 wrap-anywhere" : "truncate"
        }`}
        style={multiline ? { WebkitLineClamp: lines } : undefined}
      >
        {block.title}
      </div>
      {onResize && (
        <div
          data-resize-handle
          className={`absolute inset-x-0 bottom-0 h-4 max-h-[65%] cursor-ns-resize touch-none bg-gradient-to-t ${
            block.item ? "from-neutral-700/40" : "from-neutral-600/40"
          }`}
          onPointerDown={onResize}
        />
      )}
    </div>
  );
}

export default function DayScheduleView({
  date, dateLabel, items, plans, layer, onClose, onCreateItem, onUpdateItem, onDeleteItem, onUpdatePlanTime,
}: {
  date: string;
  dateLabel: string;
  items: DayScheduleItem[];
  plans: SchedulePlan[];
  layer: string;
  onClose: () => void;
  onCreateItem: (item: TimeFields) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<DayScheduleItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onUpdatePlanTime: (id: string, end: string) => Promise<void>;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const [gridHeight, setGridHeight] = useState(0);
  const [preview, setPreview] = useState<Drag | null>(null);
  const [savingEnd, setSavingEnd] = useState<{ key: string; end: number } | null>(null);
  const [draft, setDraft] = useState<TimeRange | null>(null);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<DayScheduleItem | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(() => setGridHeight(grid.clientHeight));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 180_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(holdTimer.current);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const blocks: TimelineBlock[] = items.map((item) => ({
    key: `item-${item.id}`,
    title: item.title,
    item,
    start: timeToMinutes(item.starts_at),
    end: timeToMinutes(item.ends_at),
    saveEnd: (end) => onUpdateItem(item.id, { ends_at: end }),
  }));
  for (const plan of plans) {
    if (plan.scheduled_for !== date || (plan.status && plan.status !== "open")) continue;
    const times = planTimelineTimes(plan);
    if (!times) continue;
    blocks.push({
      key: `plan-${plan.id}`,
      title: plan.title,
      start: timeToMinutes(times.starts_at),
      end: timeToMinutes(times.ends_at),
      saveEnd: times.canResize ? (end) => onUpdatePlanTime(plan.id, end) : undefined,
    });
  }

  const endLimit = (start: number) => blocks.reduce(
    (limit, block) => block.start > start ? Math.min(limit, block.start) : limit, DAY_END,
  );

  const cancelDrag = () => {
    window.clearTimeout(holdTimer.current);
    dragRef.current = null;
    setPreview(null);
  };

  function startDrag(event: PointerEvent<HTMLDivElement>, column: Column, block?: TimelineBlock) {
    const grid = gridRef.current;
    if (!grid || !event.isPrimary || event.button !== 0 || dragRef.current || draft || editing || savingEnd) return;
    const rect = grid.getBoundingClientRect();
    const pointerMinutes = (event.clientY - rect.top) * COLUMN_LENGTH / rect.height;
    const columnStart = COLUMN_STARTS[column];
    const start = block?.start ?? columnStart + Math.floor(pointerMinutes / STEP) * STEP;
    const end = block?.end ?? start + STEP;
    const limit = endLimit(start);
    if (!block && (start < columnStart || end > limit || blocks.some((item) => start >= item.start && start < item.end))) return;

    event.preventDefault();
    grid.setPointerCapture(event.pointerId);
    const base = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      originColumn: column,
      column,
      endOffset: block ? end - columnStart - pointerMinutes : 0,
      start,
      end,
      maxEnd: block ? Math.max(end, limit) : limit,
    };
    if (block) {
      dragRef.current = { ...base, kind: "resize", block };
      return;
    }

    const pending: Drag = { ...base, kind: "create", ready: false };
    dragRef.current = pending;
    holdTimer.current = window.setTimeout(() => {
      if (dragRef.current !== pending) return;
      pending.ready = true;
      setPreview({ ...pending });
    }, 500);
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const travel = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
    if (drag.kind === "create" && !drag.ready) {
      if (travel > 8) cancelDrag();
      return;
    }
    if (travel < 3 && drag.end === (drag.kind === "resize" ? drag.block.end : drag.start + STEP)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    const canEndOnLeft = drag.start + STEP <= COLUMN_STARTS[1];
    if (event.clientX > mid + 6) drag.column = 1;
    if (event.clientX < mid - 6 && canEndOnLeft) drag.column = 0;

    const columnStart = COLUMN_STARTS[drag.column];
    const y = event.clientY - rect.top;
    const offset = drag.column === drag.originColumn ? drag.endOffset : 0;
    const rawEnd = columnStart + y * COLUMN_LENGTH / rect.height + offset;
    const snappedEnd = Math.round(rawEnd / STEP) * STEP;
    // Give the bottom time line a larger target without extending into the next column.
    const edgeSize = Math.min(14, 0.75 * rect.height * STEP / COLUMN_LENGTH);
    const columnEnd = columnStart + COLUMN_LENGTH;
    const target = y >= rect.height - edgeSize ? columnEnd : Math.min(columnEnd, snappedEnd);
    drag.end = Math.min(drag.maxEnd, Math.max(drag.start + STEP, target));
    setPreview({ ...drag });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateDrag(event);
    cancelDrag();
    if (drag.kind === "create" && drag.ready) {
      setDraft({ start: drag.start, end: drag.end });
      setTitle("");
    }
    if (drag.kind === "resize" && drag.end !== drag.block.end && drag.block.saveEnd) {
      setSavingEnd({ key: drag.block.key, end: drag.end });
      void drag.block.saveEnd(minutesToTime(drag.end)).finally(() => setSavingEnd(null));
    }
  }

  const cancelPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) cancelDrag();
  };

  function closeDraft(save: boolean) {
    if (save && draft && title.trim()) {
      void onCreateItem({ title: title.trim(), starts_at: minutesToTime(draft.start), ends_at: minutesToTime(draft.end) });
    }
    setDraft(null);
    setTitle("");
  }

  const nowDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowMinutes = nowDate === date ? now.getHours() * 60 + now.getMinutes() : -1;
  const newRange = preview?.kind === "create" ? preview : draft;

  function renderColumn(columnStart: number, column: Column) {
    const hours = Array.from({ length: 8 }, (_, i) => (columnStart / 60 + i) % 12 || 12);
    const newSegment = newRange && segmentInColumn(newRange, columnStart);
    return (
      <div key={columnStart} className="flex min-w-0 flex-1 first:border-r first:border-neutral-700">
        <div className={`relative w-8 shrink-0 ${column === 1 ? "order-last" : ""}`}>
          {hours.map((hour, i) => (
            <div
              key={hour}
              className={`absolute text-xs leading-none text-neutral-500 ${column === 0 ? "right-1" : "left-1"} ${i === 0 ? "mt-0.5" : "-translate-y-1/2"}`}
              style={{ top: `${i / 8 * 100}%` }}
            >
              {hour}
            </div>
          ))}
          <div className={`absolute bottom-0 text-xs leading-none text-neutral-500 ${column === 0 ? "right-1" : "left-1"}`}>
            {column === 0 ? 3 : 11}
          </div>
        </div>
        <div
          className="relative min-w-0 flex-1 border-b border-neutral-800"
          onPointerDown={(event) => {
            if (!(event.target as Element).closest("[data-schedule-block]")) startDrag(event, column);
          }}
        >
          {hours.map((hour, i) => (
            <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-neutral-800" style={{ top: `${i / 8 * 100}%` }} />
          ))}
          {blocks.map((block) => {
            const end = preview?.kind === "resize" && preview.block.key === block.key ? preview.end
              : savingEnd?.key === block.key ? savingEnd.end : block.end;
            const segment = segmentInColumn({ start: block.start, end }, columnStart);
            if (!segment) return null;
            const item = block.item;
            return (
              <ScheduleBlock
                key={block.key}
                block={block}
                segment={segment}
                multiline={end - block.start > STEP}
                column={column}
                height={segment.minutes / COLUMN_LENGTH * gridHeight}
                onEdit={() => { if (item) setEditing(item); }}
                onResize={segment.isEnd && block.saveEnd ? (event) => {
                  event.stopPropagation();
                  startDrag(event, column, block);
                } : undefined}
              />
            );
          })}
          {nowMinutes >= columnStart && nowMinutes < columnStart + COLUMN_LENGTH && (
            <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-red-500" style={{ top: `${(nowMinutes - columnStart) / COLUMN_LENGTH * 100}%` }} />
          )}
          {newSegment && (draft && newSegment.isStart ? (
            <div
              className="absolute inset-x-1 z-20 rounded border border-neutral-700 bg-neutral-900 shadow-xl"
              style={{ top: newSegment.top, height: newSegment.height }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") closeDraft(false);
                }}
                onBlur={() => closeDraft(true)}
                placeholder="Event title..."
                className="h-full w-full select-text bg-transparent px-2 text-center text-[16px] text-neutral-100 outline-none"
              />
            </div>
          ) : (
            <div
              className="pointer-events-none absolute inset-x-1 z-20 rounded border border-green-400 bg-green-500/30"
              style={{ top: newSegment.top, height: newSegment.height }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 flex flex-col bg-neutral-950 pb-[env(safe-area-inset-bottom)] [@media(pointer:coarse)]:pb-[max(24px,env(safe-area-inset-bottom))] ${layer}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div>
          <div className="text-lg font-semibold text-neutral-100">{dateLabel}</div>
          <div className="text-xs text-neutral-400">
            {new Date(date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}
          </div>
        </div>
        <button aria-label="Close day schedule" onClick={onClose} className="p-2 text-2xl text-neutral-400 hover:text-neutral-200">{"\u00D7"}</button>
      </div>
      <div
        ref={gridRef}
        className="flex min-h-0 flex-1 touch-none overflow-hidden select-none"
        onPointerMove={updateDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelPointer}
        onLostPointerCapture={cancelPointer}
        onContextMenu={(event) => event.preventDefault()}
      >
        {renderColumn(COLUMN_STARTS[0], 0)}
        {renderColumn(COLUMN_STARTS[1], 1)}
      </div>
      {editing && (
        <ScheduleEditModal
          item={editing}
          onSave={(updates) => onUpdateItem(editing.id, updates)}
          onDelete={() => onDeleteItem(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// Helper to format time for display (HH:MM:SS -> h:mm a)
function formatTimeDisplay(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'am' : 'pm';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Helper to parse time input (h:mm or hh:mm, with optional am/pm) -> HH:MM:SS
function parseTimeInput(input: string): string | null {
  const cleaned = input.toLowerCase().trim();
  // Match patterns like "3:30", "3:30pm", "15:30", "3pm"
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

function ScheduleEditModal({
  item,
  onSave,
  onDelete,
  onClose,
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

    if (!parsedStart || !parsedEnd) {
      setTimeError('Invalid time format. Use h:mm am/pm (e.g., 3:30 pm)');
      return;
    }

    // Validate start is before end
    if (parsedStart >= parsedEnd) {
      setTimeError('Start time must be before end time');
      return;
    }

    onSave({ title: title.trim(), starts_at: parsedStart, ends_at: parsedEnd });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
        <div className="mb-3 text-lg font-semibold text-neutral-100">Edit Item</div>

        {/* Title */}
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') onClose();
          }}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-[16px] text-neutral-100 outline-none focus:border-neutral-500"
          placeholder="Event title..."
        />

        {/* Time inputs */}
        <div className="mt-3 flex gap-2 items-center">
          <div className="flex-1">
            <label className="text-xs text-neutral-500 mb-1 block">Start</label>
            <input
              value={startTime}
              onChange={(e) => { setStartTime(e.target.value); setTimeError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') onClose();
              }}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-[16px] text-neutral-100 outline-none focus:border-neutral-500"
              placeholder="3:00 pm"
            />
          </div>
          <div className="text-neutral-500 pt-5">→</div>
          <div className="flex-1">
            <label className="text-xs text-neutral-500 mb-1 block">End</label>
            <input
              value={endTime}
              onChange={(e) => { setEndTime(e.target.value); setTimeError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') onClose();
              }}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-[16px] text-neutral-100 outline-none focus:border-neutral-500"
              placeholder="4:00 pm"
            />
          </div>
        </div>

        {/* Error message */}
        {timeError && (
          <div className="mt-2 text-xs text-red-400">{timeError}</div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="rounded-xl border border-red-700 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-900/30"
          >
            Delete
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
