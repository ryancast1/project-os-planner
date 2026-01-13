"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: "open" | "done" | "canceled";
  scheduled_for: string | null; // YYYY-MM-DD
  created_at: string;
};

function fmtDayLabel(d: Date, index: number) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function toISODate(d: Date) {
  // local date -> YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type MoveTarget = { label: string; value: string | "" };

function TaskRow({
  task,
  onDone,
  moveTargets,
  onMove,
  tone,
}: {
  task: Task;
  onDone: (id: string) => void;
  moveTargets: MoveTarget[];
  onMove: (id: string, isoDate: string | null) => void;
  tone?: "normal" | "overdue";
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-xl border px-3 py-2",
        tone === "overdue"
          ? "border-red-900/60 bg-red-950/30"
          : "border-neutral-800 bg-neutral-900"
      )}
    >
      <button
        onClick={() => onDone(task.id)}
        className="h-5 w-5 shrink-0 rounded-md border border-neutral-700 bg-neutral-950/40 active:scale-[0.98]"
        aria-label="Mark done"
        title="Done"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{task.title}</div>
      </div>

      <select
        value={task.scheduled_for ?? ""}
        onChange={(e) => onMove(task.id, e.target.value ? e.target.value : null)}
        className="h-8 shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-200 outline-none"
        aria-label="Move"
        title="Move"
      >
        <option value="">No date</option>
        {moveTargets.map((t) => (
          <option key={t.label} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <button
        onClick={() => onDone(task.id)}
        className="shrink-0 rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-900 active:scale-[0.98]"
      >
        Done
      </button>
    </div>
  );
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [draftByDate, setDraftByDate] = useState<Record<string, string>>({});

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

  async function fetchTasks() {
    setLoading(true);
    const start = toISODate(days[0]);
    const end = toISODate(days[6]);

    // Pull tasks in the 7-day window + overdue
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,notes,status,scheduled_for,created_at")
      .eq("status", "open")
      .or(`scheduled_for.lt.${start},scheduled_for.gte.${start}`)
      .lte("scheduled_for", end)
      .order("scheduled_for", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setTasks([]);
    } else {
      setTasks((data ?? []) as Task[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overdue = useMemo(() => {
    const start = toISODate(days[0]);
    return tasks.filter((t) => t.scheduled_for && t.scheduled_for < start);
  }, [tasks, days]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const d of days) map[toISODate(d)] = [];
    for (const t of tasks) {
      if (!t.scheduled_for) continue;
      if (map[t.scheduled_for]) map[t.scheduled_for].push(t);
    }
    return map;
  }, [tasks, days]);

  async function addTaskForDate(isoDate: string) {
    const raw = draftByDate[isoDate] ?? "";
    const title = raw.trim();
    if (!title) return;

    const { error } = await supabase.from("tasks").insert({
      title,
      status: "open",
      scheduled_for: isoDate,
    });

    if (error) {
      console.error(error);
      return;
    }

    setDraftByDate((prev) => ({ ...prev, [isoDate]: "" }));
    fetchTasks();
  }

  async function markDone(taskId: string) {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) console.error(error);
    fetchTasks();
  }

  async function moveTask(taskId: string, isoDate: string | null) {
    const payload: Record<string, any> = {
      scheduled_for: isoDate,
    };

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) console.error(error);
    fetchTasks();
  }

  return (
    <main className="min-h-dvh p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Planner</h1>
          <p className="mt-1 text-sm text-neutral-400">
            v0.1 — tasks only
          </p>
        </div>

        <button
          onClick={fetchTasks}
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 shadow-sm active:scale-[0.99]"
        >
          Refresh
        </button>
      </div>
      <div className="mt-4 h-px w-full bg-neutral-800" />

      {/* Quick add (today) */}
      <div className="mt-4 flex gap-2">
        <input
          value={draftByDate[toISODate(days[0])] ?? ""}
          onChange={(e) =>
            setDraftByDate((prev) => ({
              ...prev,
              [toISODate(days[0])]: e.target.value,
            }))
          }
          placeholder="Add a task for Today…"
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
        />
        <button
          onClick={() => addTaskForDate(toISODate(days[0]))}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
        >
          Add
        </button>
      </div>

      {loading ? (
        <div className="mt-6 text-sm text-neutral-400">Loading…</div>
      ) : (
        <>
          {/* Today card (expanded) */}
          <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Today</div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  {toISODate(days[0])} • {(tasksByDay[toISODate(days[0])] ?? []).length} open
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300">
                {overdue.length > 0 ? `${overdue.length} overdue` : "on track"}
              </div>
            </div>

            {overdue.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-red-300">Overdue</div>
                <div className="mt-2 space-y-2">
                  {overdue.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onDone={markDone}
                      moveTargets={days.map((d, idx) => ({
                        label: fmtDayLabel(d, idx),
                        value: toISODate(d),
                      }))}
                      onMove={moveTask}
                      tone="overdue"
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {(tasksByDay[toISODate(days[0])] ?? []).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDone={markDone}
                  moveTargets={days.map((d, idx) => ({
                    label: fmtDayLabel(d, idx),
                    value: toISODate(d),
                  }))}
                  onMove={moveTask}
                />
              ))}
              {(tasksByDay[toISODate(days[0])] ?? []).length === 0 && (
                <div className="text-sm text-neutral-400">No tasks today.</div>
              )}
            </div>
          </section>

          {/* Next 6 days (collapsed simple list for now) */}
          <div className="mt-4 space-y-3">
            {days.slice(1).map((d, i) => {
              const iso = toISODate(d);
              const label = fmtDayLabel(d, i + 1);
              const list = tasksByDay[iso] ?? [];

              return (
                <section
                  key={iso}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{label}</div>
                    <div className="text-xs text-neutral-400">{iso}</div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      value={draftByDate[iso] ?? ""}
                      onChange={(e) =>
                        setDraftByDate((prev) => ({
                          ...prev,
                          [iso]: e.target.value,
                        }))
                      }
                      placeholder={`Add a task for ${label}…`}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
                    />
                    <button
                      onClick={() => addTaskForDate(iso)}
                      className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                    >
                      Add
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {list.slice(0, 6).map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onDone={markDone}
                        moveTargets={days.map((dd, idx) => ({
                          label: fmtDayLabel(dd, idx),
                          value: toISODate(dd),
                        }))}
                        onMove={moveTask}
                      />
                    ))}
                    {list.length === 0 && (
                      <div className="text-sm text-neutral-400">Nothing scheduled.</div>
                    )}
                    {list.length > 6 && (
                      <div className="text-xs text-neutral-500">+{list.length - 6} more</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}