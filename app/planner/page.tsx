// FULL OVERWRITE
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: "open" | "done" | "canceled";
  scheduled_for: string | null; // YYYY-MM-DD
  window_kind: "workweek" | "weekend" | null;
  window_start: string | null; // YYYY-MM-DD (Monday for workweek, Saturday for weekend)
  created_at: string;
};

function fmtDayLabel(d: Date, index: number) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function fmtMonthDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
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

type PlanningWindows = {
  thisWeekStart: string; // Monday
  nextWeekStart: string; // Monday
  thisWeekendStart: string; // Saturday
  nextWeekendStart: string; // Saturday
};

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

type MoveTarget = { label: string; value: string; group: "days" | "parking" };

function taskLocationValue(t: Task) {
  if (t.scheduled_for) return `D|${t.scheduled_for}`;
  if (t.window_kind && t.window_start) return `P|${t.window_kind}|${t.window_start}`;
  return "none";
}

function TaskRow({
  task,
  onDone,
  moveTargets,
  onMove,
  currentValue,
  tone,
}: {
  task: Task;
  onDone: (id: string) => void;
  moveTargets: MoveTarget[];
  onMove: (id: string, targetValue: string) => void;
  currentValue: string;
  tone?: "normal" | "overdue";
}) {
  const dayTargets = moveTargets.filter((t) => t.group === "days");
  const parkingTargets = moveTargets.filter((t) => t.group === "parking");

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
        value={currentValue}
        onChange={(e) => onMove(task.id, e.target.value)}
        className="h-8 shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-200 outline-none"
        aria-label="Move"
        title="Move"
      >
        <option value="none">No date</option>
        {dayTargets.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
        {/* separator */}
        <option value="__sep" disabled>
          ──────────
        </option>
        {parkingTargets.map((t) => (
          <option key={t.value} value={t.value}>
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

  const [parkingOpen, setParkingOpen] = useState(false);
  const [parkingTab, setParkingTab] = useState<
    "thisWeek" | "thisWeekend" | "nextWeek" | "nextWeekend"
  >("thisWeek");

  const [openDayIso, setOpenDayIso] = useState<string | null>(null);

  const [parkingDraft, setParkingDraft] = useState<Record<string, string>>({
    thisWeek: "",
    thisWeekend: "",
    nextWeek: "",
    nextWeekend: "",
  });

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
    ];

    return [...dayTargets, ...parkingTargets];
  }, [days, windows]);

  async function fetchTasks() {
    setLoading(true);
    const start = toISODate(days[0]);
    const end = toISODate(days[6]);

    const scheduledRes = await supabase
      .from("tasks")
      .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
      .eq("status", "open")
      .not("scheduled_for", "is", null)
      .or(`scheduled_for.lt.${start},scheduled_for.gte.${start}`)
      .lte("scheduled_for", end)
      .order("scheduled_for", { ascending: true })
      .order("created_at", { ascending: true });

    const parkingOr = [
      `and(window_kind.eq.workweek,window_start.eq.${windows.thisWeekStart})`,
      `and(window_kind.eq.weekend,window_start.eq.${windows.thisWeekendStart})`,
      `and(window_kind.eq.workweek,window_start.eq.${windows.nextWeekStart})`,
      `and(window_kind.eq.weekend,window_start.eq.${windows.nextWeekendStart})`,
    ].join(",");

    const parkingRes = await supabase
      .from("tasks")
      .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
      .eq("status", "open")
      .is("scheduled_for", null)
      .or(parkingOr)
      .order("created_at", { ascending: true });

    if (scheduledRes.error) console.error(scheduledRes.error);
    if (parkingRes.error) console.error(parkingRes.error);

    const combined = [
      ...(((scheduledRes.data ?? []) as Task[]) || []),
      ...(((parkingRes.data ?? []) as Task[]) || []),
    ];

    setTasks(combined);
    setLoading(false);
  }

  useEffect(() => {
    fetchTasks();
    setOpenDayIso(toISODate(days[0]));
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

  const parkingLists = useMemo(() => {
    const out = {
      thisWeek: [] as Task[],
      thisWeekend: [] as Task[],
      nextWeek: [] as Task[],
      nextWeekend: [] as Task[],
    };

    for (const t of tasks) {
      if (t.scheduled_for) continue;
      if (!t.window_kind || !t.window_start) continue;

      if (t.window_kind === "workweek" && t.window_start === windows.thisWeekStart)
        out.thisWeek.push(t);
      if (t.window_kind === "weekend" && t.window_start === windows.thisWeekendStart)
        out.thisWeekend.push(t);
      if (t.window_kind === "workweek" && t.window_start === windows.nextWeekStart)
        out.nextWeek.push(t);
      if (t.window_kind === "weekend" && t.window_start === windows.nextWeekendStart)
        out.nextWeekend.push(t);
    }

    return out;
  }, [tasks, windows]);

  async function addTaskForDate(isoDate: string) {
    const raw = draftByDate[isoDate] ?? "";
    const title = raw.trim();
    if (!title) return;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        status: "open",
        scheduled_for: isoDate,
        window_kind: null,
        window_start: null,
      })
      .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setDraftByDate((prev) => ({ ...prev, [isoDate]: "" }));
    if (data) setTasks((prev) => [...prev, data as Task]);
  }

  async function addTaskToParking(tab: "thisWeek" | "thisWeekend" | "nextWeek" | "nextWeekend") {
    const title = (parkingDraft[tab] ?? "").trim();
    if (!title) return;

    const kind = tab === "thisWeekend" || tab === "nextWeekend" ? "weekend" : "workweek";
    const start =
      tab === "thisWeek"
        ? windows.thisWeekStart
        : tab === "thisWeekend"
          ? windows.thisWeekendStart
          : tab === "nextWeek"
            ? windows.nextWeekStart
            : windows.nextWeekendStart;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        status: "open",
        scheduled_for: null,
        window_kind: kind,
        window_start: start,
      })
      .select("id,title,notes,status,scheduled_for,window_kind,window_start,created_at")
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setParkingDraft((p) => ({ ...p, [tab]: "" }));
    if (data) setTasks((prev) => [...prev, data as Task]);
  }

  async function markDone(taskId: string) {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) {
      console.error(error);
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  async function moveTask(taskId: string, targetValue: string) {
    // Ignore separator selection (should be disabled anyway)
    if (targetValue === "__sep") return;

    let payload: Record<string, any>;

    if (targetValue === "none") {
      payload = { scheduled_for: null, window_kind: null, window_start: null };
    } else if (targetValue.startsWith("D|")) {
      const iso = targetValue.split("|")[1];
      payload = { scheduled_for: iso, window_kind: null, window_start: null };
    } else if (targetValue.startsWith("P|")) {
      const [, kind, start] = targetValue.split("|");
      payload = { scheduled_for: null, window_kind: kind, window_start: start };
    } else {
      payload = { scheduled_for: null, window_kind: null, window_start: null };
    }

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      console.error(error);
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? ({ ...t, ...payload } as Task) : t)));
  }

  const todayIso = toISODate(days[0]);

  return (
    <main className="min-h-dvh p-4 pb-28">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Planner</h1>
          <p className="mt-1 text-sm text-neutral-400">v0.1 — tasks only</p>
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
          value={draftByDate[todayIso] ?? ""}
          onChange={(e) =>
            setDraftByDate((prev) => ({
              ...prev,
              [todayIso]: e.target.value,
            }))
          }
          placeholder="Add a task for Today…"
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
        />
        <button
          onClick={() => addTaskForDate(todayIso)}
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
        >
          Add
        </button>
      </div>

      {loading ? (
        <div className="mt-6 text-sm text-neutral-400">Loading…</div>
      ) : (
        <>
          {/* Today card */}
          <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Today</div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  {fmtMonthDay(days[0])} • {(tasksByDay[todayIso] ?? []).length} open
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
                      moveTargets={moveTargets}
                      onMove={moveTask}
                      tone="overdue"
                      currentValue={taskLocationValue(t)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {(tasksByDay[todayIso] ?? []).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDone={markDone}
                  moveTargets={moveTargets}
                  onMove={moveTask}
                  currentValue={taskLocationValue(t)}
                />
              ))}
              {(tasksByDay[todayIso] ?? []).length === 0 && (
                <div className="text-sm text-neutral-400">No tasks today.</div>
              )}
            </div>
          </section>

          {/* Next 6 days (collapsible) */}
          <div className="mt-4 space-y-3">
            {days.slice(1).map((d, i) => {
              const iso = toISODate(d);
              const label = fmtDayLabel(d, i + 1);
              const list = tasksByDay[iso] ?? [];
              const isOpen = openDayIso === iso;

              return (
                <section
                  key={iso}
                  className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm"
                >
                  <button
                    onClick={() => setOpenDayIso((cur) => (cur === iso ? null : iso))}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div>
                      <div className="font-semibold">{label}</div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        {fmtMonthDay(d)} • {list.length} open
                      </div>
                    </div>
                    <div className="text-sm text-neutral-400">{isOpen ? "–" : "+"}</div>
                  </button>

                  {isOpen ? (
                    <>
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
                        {list.map((t) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            onDone={markDone}
                            moveTargets={moveTargets}
                            onMove={moveTask}
                            currentValue={taskLocationValue(t)}
                          />
                        ))}
                        {list.length === 0 && (
                          <div className="text-sm text-neutral-400">Nothing scheduled.</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {list.slice(0, 2).map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onDone={markDone}
                          moveTargets={moveTargets}
                          onMove={moveTask}
                          currentValue={taskLocationValue(t)}
                        />
                      ))}
                      {list.length === 0 && (
                        <div className="text-sm text-neutral-500">Tap to open.</div>
                      )}
                      {list.length > 2 && (
                        <div className="text-xs text-neutral-500">+{list.length - 2} more</div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom drawer (no label) */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-xl">
          {!parkingOpen ? (
            <button
              onClick={() => setParkingOpen(true)}
              className="w-full rounded-t-2xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-neutral-400">
                  Week {parkingLists.thisWeek.length} • Weekend {parkingLists.thisWeekend.length} • Next {parkingLists.nextWeek.length} • Next Wknd {parkingLists.nextWeekend.length}
                </div>
                <div className="text-sm text-neutral-400">▲</div>
              </div>
            </button>
          ) : (
            <div className="rounded-t-2xl border border-neutral-800 bg-neutral-950">
              <div className="flex items-center justify-between px-4 py-2">
                <div />
                <button
                  onClick={() => setParkingOpen(false)}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                >
                  Close
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto px-4 pb-2">
                {([
                  ["thisWeek", `This Week (${parkingLists.thisWeek.length})`],
                  ["thisWeekend", `This Weekend (${parkingLists.thisWeekend.length})`],
                  ["nextWeek", `Next Week (${parkingLists.nextWeek.length})`],
                  ["nextWeekend", `Next Weekend (${parkingLists.nextWeekend.length})`],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setParkingTab(key)}
                    className={clsx(
                      "whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold",
                      parkingTab === key
                        ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                        : "border-neutral-800 bg-neutral-900 text-neutral-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[55vh] overflow-y-auto px-4 pb-4">
                <div className="flex gap-2">
                  <input
                    value={parkingDraft[parkingTab] ?? ""}
                    onChange={(e) =>
                      setParkingDraft((p) => ({ ...p, [parkingTab]: e.target.value }))
                    }
                    placeholder="Add…"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none"
                  />
                  <button
                    onClick={() => addTaskToParking(parkingTab)}
                    className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99]"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {(parkingTab === "thisWeek"
                    ? parkingLists.thisWeek
                    : parkingTab === "thisWeekend"
                      ? parkingLists.thisWeekend
                      : parkingTab === "nextWeek"
                        ? parkingLists.nextWeek
                        : parkingLists.nextWeekend
                  ).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onDone={markDone}
                      moveTargets={moveTargets}
                      onMove={moveTask}
                      currentValue={taskLocationValue(t)}
                    />
                  ))}

                  {parkingTab === "thisWeek" && parkingLists.thisWeek.length === 0 && (
                    <div className="text-sm text-neutral-500">Empty.</div>
                  )}
                  {parkingTab === "thisWeekend" && parkingLists.thisWeekend.length === 0 && (
                    <div className="text-sm text-neutral-500">Empty.</div>
                  )}
                  {parkingTab === "nextWeek" && parkingLists.nextWeek.length === 0 && (
                    <div className="text-sm text-neutral-500">Empty.</div>
                  )}
                  {parkingTab === "nextWeekend" && parkingLists.nextWeekend.length === 0 && (
                    <div className="text-sm text-neutral-500">Empty.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}