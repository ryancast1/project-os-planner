"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Habit = {
  id: string;
  name: string;
  short_label: string | null;
  notes: string | null;
  target_per_week: number | null;
  is_active: boolean;
  created_at: string;
};

function clampLabel(s: string) {
  const v = (s ?? "").trim().toUpperCase();
  return v.slice(0, 3);
}

function isBuiltInHabit(h: Habit) {
  const label = (h.short_label ?? "").trim().toUpperCase();
  const name = (h.name ?? "").trim();
  return (
    label === "W" ||
    label === "GYM" ||
    label === "RUN" ||
    /\bweed\b/i.test(name) ||
    /\bgym\b/i.test(name) ||
    /\brun(?:ning)?\b/i.test(name)
  );
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMD(iso: string) {
  // iso: YYYY-MM-DD
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${m}/${d}`;
}

function guessISODateFromRow(row: any): string | null {
  if (!row || typeof row !== "object") return null;
  const keys = [
    "done_on",
    "workout_on",
    "worked_on",
    "workout_date",
    "session_date",
    "performed_on",
    "date",
    "scheduled_for",
    "created_at",
  ];

  for (const k of keys) {
    const v = (row as any)[k];
    if (!v) continue;

    if (typeof v === "string") {
      // allow YYYY-MM-DD or timestamptz
      const iso = v.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
      const dt = new Date(v);
      if (!isNaN(dt.getTime())) return toISODate(dt);
    }

    if (v instanceof Date) {
      return toISODate(v);
    }
  }

  return null;
}

async function fetchAllTrichEventsInRange(userId: string, startIso: string, endIso: string) {
  const pageSize = 1000;
  let from = 0;
  const all: Array<{ occurred_on: string; trich: number }> = [];

  while (true) {
    const { data, error } = await supabase
      .from("trich_events")
      .select("occurred_on,trich")
      .eq("user_id", userId)
      .gte("occurred_on", startIso)
      .lte("occurred_on", endIso)
      .order("occurred_on", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = (data ?? []) as Array<{ occurred_on: string; trich: number }>;
    all.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;

    if (from > 50000) break;
  }

  return all;
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-3">
        <div className="w-full sm:max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
            <div className="text-sm font-semibold text-neutral-100">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 active:scale-[0.99]"
            >
              Close
            </button>
          </div>
          <div className="px-4 py-4 pb-[calc(96px+env(safe-area-inset-bottom))] sm:pb-[calc(16px+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const START_ISO = "2026-01-01";
  const WEED_AUTOMATION_START_ISO = "2026-08-07";
  const todayIso = useMemo(() => toISODate(new Date()), []);

  // Consistency grid
  const [gridErr, setGridErr] = useState<string | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [doneByDate, setDoneByDate] = useState<Record<string, Record<string, true>>>({});
  const [gymDoneByDate, setGymDoneByDate] = useState<Record<string, true>>({});
  const [runDoneByDate, setRunDoneByDate] = useState<Record<string, true>>({});
  const [weedHitByDate, setWeedHitByDate] = useState<Record<string, true>>({});
  const [alcoholEntryByDate, setAlcoholEntryByDate] = useState<Record<string, true>>({});
  const [weedLookupReady, setWeedLookupReady] = useState(false);
  const [alcoholLookupReady, setAlcoholLookupReady] = useState(false);
  const [t1ZeroByDate, setT1ZeroByDate] = useState<Record<string, true>>({});
  const [t2ZeroByDate, setT2ZeroByDate] = useState<Record<string, true>>({});

  // Add bar
  const [draftLabel, setDraftLabel] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const addNameRef = useRef<HTMLInputElement | null>(null);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editHabit, setEditHabit] = useState<Habit | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const activeHabits = useMemo(() => habits.filter((h) => h.is_active), [habits]);

  const weedHabitId = useMemo(() => {
    const h = habits.find((x) => (x.short_label ?? "").toUpperCase() === "W") ??
      habits.find((x) => /\bweed\b/i.test(x.name));
    return h?.id ?? null;
  }, [habits]);

  const manualHabits = useMemo(() => (
    activeHabits.filter((h) => !isBuiltInHabit(h))
  ), [activeHabits]);

  const dateRows = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    while (true) {
      const iso = toISODate(d);
      out.push(iso);
      if (iso <= START_ISO) break;
      d.setDate(d.getDate() - 1);
    }
    // Ensure we stop exactly at START_ISO (and not below due to timezone edge cases)
    while (out.length && out[out.length - 1] < START_ISO) out.pop();
    return out;
  }, []);
  useEffect(() => {
    let alive = true;

    (async () => {
      setGridLoading(true);
      setGridErr(null);
      setWeedLookupReady(false);
      setAlcoholLookupReady(false);

      const habitIds = Array.from(new Set([
        ...activeHabits.map((h) => h.id),
        ...(weedHabitId ? [weedHabitId] : []),
      ]));

      // 1) habit_logs for all active habits
      const logsRes = habitIds.length > 0
        ? await supabase
            .from("habit_logs")
            .select("habit_id,done_on")
            .in("habit_id", habitIds)
            .gte("done_on", START_ISO)
            .lte("done_on", todayIso)
        : { data: [], error: null };

      // 2) workout_sessions for GYM column (best-effort)
      // Now select only performed_on and filter by performed_on date.
      const workoutsRes = await supabase
        .from("workout_sessions")
        .select("performed_on")
        .gte("performed_on", START_ISO)
        .lte("performed_on", todayIso);

      // 3) running_runs for RUN column (best-effort)
      const runsRes = await supabase
        .from("running_runs")
        .select("run_date")
        .gte("run_date", START_ISO)
        .lte("run_date", todayIso);

      // 4) weed_hits for W column from 2026-08-07 onward (best-effort)
      const weedHitsRes = await supabase
        .from("weed_hits")
        .select("occurred_on")
        .gte("occurred_on", WEED_AUTOMATION_START_ISO)
        .lte("occurred_on", todayIso);

      // 5) alcohol_entries for A column from 2026-08-07 onward (best-effort)
      const alcoholEntriesRes = await supabase
        .from("alcohol_entries")
        .select("occurred_on")
        .gte("occurred_on", WEED_AUTOMATION_START_ISO)
        .lte("occurred_on", todayIso);

      // 6) trich_events for T1/T2 columns - paginate so older days do not disappear past the row cap
      const authRes = await supabase.auth.getUser();
      const trichRes = authRes.error || !authRes.data.user?.id
        ? { data: null, error: authRes.error ?? new Error("Not logged in") }
        : await (async () => {
            try {
              const data = await fetchAllTrichEventsInRange(authRes.data.user.id, START_ISO, todayIso);
              return { data, error: null };
            } catch (error) {
              return {
                data: null,
                error: error instanceof Error ? error : new Error("Failed to load trich events"),
              };
            }
          })();

      if (!alive) return;

      if (logsRes.error) {
        console.warn(logsRes.error);
        setGridErr(logsRes.error.message);
      }

      if (workoutsRes.error) {
        console.warn(workoutsRes.error);
        // don't fail the whole grid for this
      }

      if (trichRes.error) {
        console.warn(trichRes.error);
        // don't fail the whole grid for this
      }

      if (runsRes.error) {
        console.warn(runsRes.error);
        // don't fail the whole grid for this
      }

      if (weedHitsRes.error) {
        console.warn(weedHitsRes.error);
        // don't fail the whole grid for this
      }

      if (alcoholEntriesRes.error) {
        console.warn(alcoholEntriesRes.error);
        // don't fail the whole grid for this
      }

      const nextDoneByDate: Record<string, Record<string, true>> = {};
      for (const r of (logsRes.data ?? []) as any[]) {
        const date = typeof r.done_on === "string" ? r.done_on : null;
        const hid = r.habit_id as string | undefined;
        if (!date || !hid) continue;
        if (!nextDoneByDate[date]) nextDoneByDate[date] = {};
        nextDoneByDate[date][hid] = true;
      }

      const nextGymDone: Record<string, true> = {};
      if (!workoutsRes.error) {
        for (const r of (workoutsRes.data ?? []) as any[]) {
          const iso = typeof r.performed_on === "string" ? r.performed_on : null;
          if (!iso) continue;
          if (iso < START_ISO || iso > todayIso) continue;
          nextGymDone[iso] = true;
        }
      }

      const nextRunDone: Record<string, true> = {};
      if (!runsRes.error) {
        for (const r of (runsRes.data ?? []) as any[]) {
          const iso = typeof r.run_date === "string" ? r.run_date : null;
          if (!iso) continue;
          if (iso < START_ISO || iso > todayIso) continue;
          nextRunDone[iso] = true;
        }
      }

      const nextWeedHits: Record<string, true> = {};
      if (!weedHitsRes.error) {
        for (const r of (weedHitsRes.data ?? []) as any[]) {
          const iso = typeof r.occurred_on === "string" ? r.occurred_on : null;
          if (!iso) continue;
          if (iso < WEED_AUTOMATION_START_ISO || iso > todayIso) continue;
          nextWeedHits[iso] = true;
        }
      }

      const nextAlcoholEntries: Record<string, true> = {};
      if (!alcoholEntriesRes.error) {
        for (const r of (alcoholEntriesRes.data ?? []) as any[]) {
          const iso = typeof r.occurred_on === "string" ? r.occurred_on : null;
          if (!iso) continue;
          if (iso < WEED_AUTOMATION_START_ISO || iso > todayIso) continue;
          nextAlcoholEntries[iso] = true;
        }
      }

      // Count T1/T2 events per day
      const t1CountByDate: Record<string, number> = {};
      const t2CountByDate: Record<string, number> = {};
      if (!trichRes.error) {
        for (const r of (trichRes.data ?? []) as any[]) {
          const iso = typeof r.occurred_on === "string" ? r.occurred_on : null;
          const trich = Number(r.trich);
          if (!iso || iso < START_ISO || iso > todayIso) continue;
          if (trich === 1) {
            t1CountByDate[iso] = (t1CountByDate[iso] ?? 0) + 1;
          } else if (trich === 2) {
            t2CountByDate[iso] = (t2CountByDate[iso] ?? 0) + 1;
          }
        }
      }

      // Mark days with 0 T1/T2 as "done" (green)
      const nextT1Zero: Record<string, true> = {};
      const nextT2Zero: Record<string, true> = {};
      const d = new Date();
      while (true) {
        const iso = toISODate(d);
        if (iso < START_ISO) break;
        if (iso >= "2026-01-04" && iso <= todayIso && (t2CountByDate[iso] ?? 0) === 0) {
          nextT2Zero[iso] = true;
        }
        if (iso >= "2026-01-04" && iso <= todayIso && (t1CountByDate[iso] ?? 0) === 0) {
          nextT1Zero[iso] = true;
        }
        d.setDate(d.getDate() - 1);
      }

      setDoneByDate(nextDoneByDate);
      setGymDoneByDate(nextGymDone);
      setRunDoneByDate(nextRunDone);
      setWeedHitByDate(nextWeedHits);
      setAlcoholEntryByDate(nextAlcoholEntries);
      setWeedLookupReady(!weedHitsRes.error);
      setAlcoholLookupReady(!alcoholEntriesRes.error);
      setT1ZeroByDate(nextT1Zero);
      setT2ZeroByDate(nextT2Zero);
      setGridLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [activeHabits, START_ISO, todayIso, weedHabitId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("habits")
        .select("id,name,short_label,notes,target_per_week,is_active,created_at")
        .order("created_at", { ascending: true });

      if (!alive) return;
      if (error) {
        console.warn(error);
        setErr(error.message);
        setHabits([]);
        setLoading(false);
        return;
      }

      setHabits((data ?? []) as Habit[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  function openEdit(h: Habit) {
    setEditHabit(h);
    setEditLabel(h.short_label ?? "");
    setEditName(h.name ?? "");
    setEditNotes(h.notes ?? "");
    setEditOpen(true);
  }

  async function addHabit() {
    const name = draftName.trim();
    if (!name) return;

    const short_label = clampLabel(draftLabel);
    const notes = draftNotes.trim() ? draftNotes.trim() : null;

    // optimistic
    const tmp: Habit = {
      id: `tmp-${Math.random().toString(36).slice(2)}`,
      name,
      short_label: short_label || null,
      notes,
      target_per_week: null,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    setHabits((p) => [...p, tmp]);

    setDraftName("");
    setDraftLabel("");
    setDraftNotes("");
    window.setTimeout(() => addNameRef.current?.focus(), 0);

    const { data, error } = await supabase
      .from("habits")
      .insert({
        name,
        short_label: short_label || null,
        notes,
        is_active: true,
      })
      .select("id,name,short_label,notes,target_per_week,is_active,created_at")
      .single();

    if (error) {
      console.warn(error);
      setHabits((p) => p.filter((h) => h.id !== tmp.id));
      setErr(error.message);
      return;
    }

    const real = data as Habit;
    setHabits((p) => p.map((h) => (h.id === tmp.id ? real : h)));
  }

  async function saveEdit() {
    if (!editHabit) return;
    const id = editHabit.id;

    const name = editName.trim();
    if (!name) return;

    const short_label = clampLabel(editLabel);
    const notes = editNotes.trim() ? editNotes.trim() : null;

    setEditBusy(true);

    // optimistic update
    setHabits((p) =>
      p.map((h) =>
        h.id === id
          ? { ...h, name, short_label: short_label || null, notes }
          : h
      )
    );

    const { error } = await supabase
      .from("habits")
      .update({
        name,
        short_label: short_label || null,
        notes,
      })
      .eq("id", id);

    setEditBusy(false);

    if (error) {
      console.warn(error);
      setErr(error.message);
      return;
    }

    setEditOpen(false);
  }

  async function archiveHabit() {
    if (!editHabit) return;
    const id = editHabit.id;
    setEditBusy(true);

    // optimistic
    setHabits((p) => p.map((h) => (h.id === id ? { ...h, is_active: false } : h)));

    const { error } = await supabase.from("habits").update({ is_active: false }).eq("id", id);

    setEditBusy(false);

    if (error) {
      console.warn(error);
      setErr(error.message);
      // revert
      setHabits((p) => p.map((h) => (h.id === id ? { ...h, is_active: true } : h)));
      return;
    }

    setEditOpen(false);
  }

  return (
    <main className="h-full overflow-y-auto px-4 py-3 pb-[calc(100px+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-5xl">
        {err ? (
          <div className="mb-3 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {/* Add bar */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-2">
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-12 sm:col-span-4">
              <input
                ref={addNameRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHabit();
                  }
                }}
                placeholder="Add a habit…"
                className="h-9 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-[15px] text-neutral-100 placeholder:text-neutral-600 outline-none sm:text-sm"
              />
            </div>

            <div className="col-span-4 sm:col-span-2">
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(clampLabel(e.target.value))}
                placeholder="Label"
                className="h-9 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-[15px] text-neutral-100 placeholder:text-neutral-600 outline-none sm:text-sm"
              />
            </div>

            <div className="col-span-8 sm:col-span-5">
              <input
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="h-9 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-[15px] text-neutral-100 placeholder:text-neutral-600 outline-none sm:text-sm"
              />
            </div>

            <div className="col-span-12 sm:col-span-1">
              <button
                type="button"
                onClick={addHabit}
                className="h-9 w-full rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Table (desktop) */}
        <div className="mt-3 hidden md:block overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/20">
          <div className="grid grid-cols-12 gap-0 border-b border-neutral-900 bg-neutral-950/40 px-3 py-2 text-[11px] font-semibold text-neutral-400">
            <div className="col-span-3">Habit</div>
            <div className="col-span-2">Label</div>
            <div className="col-span-7">Notes</div>
          </div>

          {loading ? (
            <div className="px-3 py-3 text-sm text-neutral-500">Loading…</div>
          ) : activeHabits.length === 0 ? (
            <div className="px-3 py-3 text-sm text-neutral-500">No habits yet.</div>
          ) : (
            activeHabits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => openEdit(h)}
                className="grid grid-cols-12 w-full text-left gap-0 px-3 py-3 border-b border-neutral-900/70 hover:bg-neutral-950/40 active:scale-[0.999]"
              >
                <div className="col-span-3 min-w-0">
                  <div className="text-sm text-neutral-100 truncate">{h.name}</div>
                </div>

                <div className="col-span-2">
                  <span className="inline-flex h-6 items-center rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs font-semibold text-neutral-200">
                    {(h.short_label ?? "").toUpperCase() || "—"}
                  </span>
                </div>

                <div className="col-span-7 min-w-0">
                  <div className="truncate text-sm text-neutral-300">{h.notes ?? ""}</div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Cards (mobile) */}
        <div className="mt-3 md:hidden space-y-1.5">
          {loading ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 px-3 py-3 text-sm text-neutral-500">
              Loading…
            </div>
          ) : activeHabits.length === 0 ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 px-3 py-3 text-sm text-neutral-500">
              No habits yet.
            </div>
          ) : (
            activeHabits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => openEdit(h)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/20 px-3 py-3 text-left active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="truncate text-sm font-semibold text-neutral-100">{h.name}</div>
                  </div>
                  <span className="inline-flex h-7 items-center rounded-xl border border-neutral-800 bg-neutral-950 px-2 text-xs font-semibold text-neutral-200">
                    {(h.short_label ?? "").toUpperCase() || "—"}
                  </span>
                </div>
                {h.notes ? (
                  <div className="mt-2 text-xs text-neutral-400 line-clamp-1">{h.notes}</div>
                ) : null}
              </button>
            ))
          )}
        </div>

        {/* Consistency grid */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/20">

          {gridErr ? (
            <div className="px-3 py-2 text-xs text-red-200">{gridErr}</div>
          ) : null}

          <div className="overflow-x-auto px-3 py-3">
            <div className="flex justify-center">
              <div className="min-w-max">
                <div
                  className="grid gap-0"
                  style={{
                    gridTemplateColumns: `56px repeat(${6 + manualHabits.length}, 28px)`,
                  }}
                >
                  {/* Header */}
                  <div className="text-[11px] font-semibold text-neutral-400">Date</div>
                  <div className="text-center text-[11px] font-semibold text-neutral-400">T1</div>
                  <div className="text-center text-[11px] font-semibold text-neutral-400">T2</div>
                  <div className="text-center text-[11px] font-semibold text-neutral-400">A</div>
                  <div className="text-center text-[11px] font-semibold text-neutral-400">W</div>
                  <div className="text-center text-[11px] font-semibold text-neutral-400">GYM</div>
                  <div className="text-center text-[11px] font-semibold text-neutral-400">RUN</div>
                  {manualHabits.map((h) => (
                    <div
                      key={h.id}
                      className="text-center text-[11px] font-semibold text-neutral-400"
                    >
                      {(h.short_label ?? "").toUpperCase() || clampLabel(h.name)}
                    </div>
                  ))}

                  {/* Rows */}
                  {dateRows.map((iso) => {
                    const dt = new Date(`${iso}T00:00:00`);
                    // dateRows are rendered from today downward (descending). Week breaks should appear
                    // between Sunday and Monday, which in descending order means inserting a gap after Monday.
                    const isMonday = dt.getDay() === 1;
                    const t1Zero = !!t1ZeroByDate[iso];
                    const t2Zero = !!t2ZeroByDate[iso];
                    const alcoholDone = alcoholLookupReady && iso >= WEED_AUTOMATION_START_ISO && !alcoholEntryByDate[iso];
                    const weedDone = weedLookupReady && iso >= WEED_AUTOMATION_START_ISO
                      ? !weedHitByDate[iso]
                      : !!(weedHabitId && doneByDate[iso]?.[weedHabitId]);

                    return (
                      <div key={iso} className="contents">
                        <div className="pt-[2px] text-[11px] font-semibold text-neutral-400">
                          {fmtMD(iso)}
                        </div>

                        {/* T1 column */}
                        <div
                          className={clsx(
                            "h-7 w-7 rounded-lg border",
                            "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
                            t1Zero
                              ? "border-emerald-200/30 bg-emerald-400/75"
                              : "border-neutral-800 bg-neutral-950/60"
                          )}
                        />

                        {/* T2 column */}
                        <div
                          className={clsx(
                            "h-7 w-7 rounded-lg border",
                            "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
                            t2Zero
                              ? "border-emerald-200/30 bg-emerald-400/75"
                              : "border-neutral-800 bg-neutral-950/60"
                          )}
                        />

                        <div
                          className={clsx(
                            "h-7 w-7 rounded-lg border",
                            "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
                            alcoholDone
                              ? "border-emerald-200/30 bg-emerald-400/75"
                              : "border-neutral-800 bg-neutral-950/60"
                          )}
                        />
                        <div
                          className={clsx(
                            "h-7 w-7 rounded-lg border",
                            "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
                            weedDone
                              ? "border-emerald-200/30 bg-emerald-400/75"
                              : "border-neutral-800 bg-neutral-950/60"
                          )}
                        />
                        <div
                          className={clsx(
                            "h-7 w-7 rounded-lg border",
                            "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
                            gymDoneByDate[iso]
                              ? "border-emerald-200/30 bg-emerald-400/75"
                              : "border-neutral-800 bg-neutral-950/60"
                          )}
                        />
                        <div
                          className={clsx(
                            "h-7 w-7 rounded-lg border",
                            "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
                            runDoneByDate[iso]
                              ? "border-emerald-200/30 bg-emerald-400/75"
                              : "border-neutral-800 bg-neutral-950/60"
                          )}
                        />

                        {manualHabits.map((h) => {
                          const done = !!doneByDate[iso]?.[h.id];

                          return (
                            <div
                              key={h.id + iso}
                              className={clsx(
                                "h-7 w-7 rounded-lg border",
                                "shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
                                done
                                  ? "border-emerald-200/30 bg-emerald-400/75"
                                  : "border-neutral-800 bg-neutral-950/60"
                              )}
                            />
                          );
                        })}

                        {/* Gap between weeks (between Sunday and Monday). Since we're rendering descending,
                            insert the gap after Monday so it appears between Monday (above) and Sunday (below). */}
                        {isMonday && iso !== dateRows[dateRows.length - 1] ? (
                          <>
                            <div className="h-2" />
                            <div className="h-2" /> {/* T1 column gap */}
                            <div className="h-2" /> {/* T2 column gap */}
                            <div className="h-2" />
                            <div className="h-2" />
                            <div className="h-2" />
                            <div className="h-2" />
                            {manualHabits.map((h) => (
                              <div key={`gap-${iso}-${h.id}`} className="h-2" />
                            ))}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Edit modal */}
        <Modal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={editHabit ? editHabit.name : "Edit Habit"}
        >
          {editHabit ? (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <div className="mb-1 text-xs text-neutral-400">Label</div>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(clampLabel(e.target.value))}
                    className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
                  />
                </div>
                <div className="col-span-8">
                  <div className="mb-1 text-xs text-neutral-400">Habit</div>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-[16px] text-neutral-100 outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Notes</div>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder=""
                  rows={3}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-100 outline-none resize-none sm:text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={archiveHabit}
                  disabled={editBusy}
                  className={clsx(
                    "rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200",
                    editBusy && "opacity-60"
                  )}
                >
                  Archive
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={editBusy}
                    className={clsx(
                      "rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]",
                      editBusy && "opacity-60"
                    )}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    </main>
  );
}
