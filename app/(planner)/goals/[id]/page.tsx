"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type WindowKind = "workweek" | "weekend";

type GoalRow = {
  id: string;
  bucket: string;
  goal: string;
  actions: string | null;
  notes: string | null;
  archived: boolean;
};

type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  status: "open" | "done" | "canceled";
  scheduled_for: string | null;
  window_kind: WindowKind | null;
  window_start: string | null;
  project_goal_id: string | null;
  created_at: string;
  completed_at: string | null;
  sort_order: number | null;
};

type PlanningWindows = {
  thisWeekStart: string;
  nextWeekStart: string;
  thisWeekendStart: string;
  nextWeekendStart: string;
};

type MoveTarget = {
  value: string;
  label: string;
};

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function upcomingSaturday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const daysUntilSat = (6 - day + 7) % 7;
  x.setDate(x.getDate() + daysUntilSat);
  return x;
}

function computePlanningWindows(today: Date): PlanningWindows {
  const dow = today.getDay();
  const baseWeekMonday = startOfWeekMonday(today);
  const planningWeekMonday = dow === 6 || dow === 0 ? addDays(baseWeekMonday, 7) : baseWeekMonday;
  const thisWeekendSat = dow === 6 ? today : dow === 0 ? addDays(today, -1) : upcomingSaturday(today);

  return {
    thisWeekStart: toISODate(planningWeekMonday),
    nextWeekStart: toISODate(addDays(planningWeekMonday, 7)),
    thisWeekendStart: toISODate(thisWeekendSat),
    nextWeekendStart: toISODate(addDays(thisWeekendSat, 7)),
  };
}

function fmtDate(iso: string) {
  return fromISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildPlacement(targetValue: string) {
  if (targetValue === "none") {
    return { scheduled_for: null, window_kind: null, window_start: null };
  }

  if (targetValue.startsWith("D|")) {
    return { scheduled_for: targetValue.split("|")[1], window_kind: null, window_start: null };
  }

  if (targetValue.startsWith("P|")) {
    const [, kind, start] = targetValue.split("|");
    return { scheduled_for: null, window_kind: kind as WindowKind, window_start: start };
  }

  return { scheduled_for: null, window_kind: null, window_start: null };
}

function placementValueFor(task: TaskRow) {
  if (task.scheduled_for) return `D|${task.scheduled_for}`;
  if (task.window_kind && task.window_start) return `P|${task.window_kind}|${task.window_start}`;
  return "none";
}

function dateLabelForTask(task: TaskRow, ctx: { todayIso: string; tomorrowIso: string; windows: PlanningWindows }) {
  if (!task.scheduled_for && !task.window_kind && !task.window_start) return "Open";
  if (task.scheduled_for === ctx.todayIso) return "Today";
  if (task.scheduled_for === ctx.tomorrowIso) return "Tomorrow";
  if (task.scheduled_for) return fmtDate(task.scheduled_for);
  if (task.window_kind === "weekend" && task.window_start === ctx.windows.thisWeekendStart) return "This Weekend";
  if (task.window_kind === "workweek" && task.window_start === ctx.windows.thisWeekStart) return "This Week";
  if (task.window_kind === "workweek" && task.window_start === ctx.windows.nextWeekStart) return "Next Week";
  if (task.window_kind === "weekend" && task.window_start === ctx.windows.nextWeekendStart) return "Next Weekend";
  if (task.window_start) return `${task.window_kind === "weekend" ? "Weekend" : "Week"} of ${fmtDate(task.window_start)}`;
  return "Open";
}

function sortMetaForTask(task: TaskRow, windows: PlanningWindows) {
  if (!task.scheduled_for && !task.window_kind && !task.window_start) {
    return { dateKey: "9999-12-31", tieRank: 9 };
  }

  if (task.scheduled_for) {
    return { dateKey: task.scheduled_for, tieRank: 0 };
  }

  if (task.window_kind === "workweek" && task.window_start === windows.thisWeekStart) {
    return { dateKey: toISODate(addDays(fromISODate(windows.thisWeekStart), 4)), tieRank: 1 };
  }
  if (task.window_kind === "weekend" && task.window_start === windows.thisWeekendStart) {
    return { dateKey: toISODate(addDays(fromISODate(windows.thisWeekendStart), 1)), tieRank: 1 };
  }
  if (task.window_kind === "workweek" && task.window_start === windows.nextWeekStart) {
    return { dateKey: toISODate(addDays(fromISODate(windows.nextWeekStart), 4)), tieRank: 1 };
  }
  if (task.window_kind === "weekend" && task.window_start === windows.nextWeekendStart) {
    return { dateKey: toISODate(addDays(fromISODate(windows.nextWeekendStart), 1)), tieRank: 1 };
  }

  if (task.window_start) {
    const endOffset = task.window_kind === "weekend" ? 1 : 4;
    return { dateKey: toISODate(addDays(fromISODate(task.window_start), endOffset)), tieRank: 1 };
  }

  return { dateKey: "9999-12-31", tieRank: 9 };
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = typeof params?.id === "string" ? params.id : "";

  const [project, setProject] = useState<GoalRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingProjectField, setSavingProjectField] = useState<"actions" | "notes" | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTarget, setDraftTarget] = useState("none");
  const [showComplete, setShowComplete] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const todayIso = useMemo(() => toISODate(today), [today]);
  const tomorrowIso = useMemo(() => toISODate(tomorrow), [tomorrow]);
  const windows = useMemo(() => computePlanningWindows(today), [today]);

  const moveTargets = useMemo<MoveTarget[]>(() => ([
    { value: `D|${todayIso}`, label: "Today" },
    { value: `D|${tomorrowIso}`, label: "Tomorrow" },
    { value: `P|workweek|${windows.thisWeekStart}`, label: "This Week" },
    { value: `P|weekend|${windows.thisWeekendStart}`, label: "This Weekend" },
    { value: `P|workweek|${windows.nextWeekStart}`, label: "Next Week" },
    { value: `P|weekend|${windows.nextWeekendStart}`, label: "Next Weekend" },
    { value: "none", label: "Open / No Date" },
  ]), [todayIso, tomorrowIso, windows]);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!projectId) return;
      setLoading(true);

      const [projectRes, tasksRes] = await Promise.all([
        supabase
          .from("projects_goals")
          .select("id,bucket,goal,actions,notes,archived")
          .eq("id", projectId)
          .maybeSingle(),
        supabase
          .from("tasks")
          .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at,completed_at,sort_order")
          .eq("project_goal_id", projectId)
          .in("status", ["open", "done"])
          .order("created_at", { ascending: true }),
      ]);

      if (!alive) return;
      if (projectRes.error) console.error(projectRes.error);
      if (tasksRes.error) console.error(tasksRes.error);

      setProject((projectRes.data as GoalRow | null) ?? null);
      setTasks((tasksRes.data as TaskRow[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const visibleTasks = useMemo(() => {
    const filtered = showComplete ? tasks : tasks.filter((task) => task.status !== "done");
    return [...filtered].sort((a, b) => {
      const aDone = a.status === "done";
      const bDone = b.status === "done";
      if (aDone !== bDone) return aDone ? -1 : 1;

      const aOpen = !a.scheduled_for && !a.window_kind && !a.window_start;
      const bOpen = !b.scheduled_for && !b.window_kind && !b.window_start;
      if (aOpen !== bOpen) return aOpen ? 1 : -1;

      const aMeta = sortMetaForTask(a, windows);
      const bMeta = sortMetaForTask(b, windows);
      if (aMeta.dateKey !== bMeta.dateKey) return aMeta.dateKey.localeCompare(bMeta.dateKey);
      if (aMeta.tieRank !== bMeta.tieRank) return aMeta.tieRank - bMeta.tieRank;

      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [showComplete, tasks, windows]);

  const openTaskIds = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "done" && !task.scheduled_for && !task.window_kind && !task.window_start)
        .sort((a, b) => {
          if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })
        .map((task) => task.id),
    [tasks]
  );

  async function refreshTasks() {
    if (!projectId) return;
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at,completed_at,sort_order")
      .eq("project_goal_id", projectId)
      .in("status", ["open", "done"])
      .order("created_at", { ascending: true });
    if (error) return console.error(error);
    setTasks((data as TaskRow[]) ?? []);
  }

  function getNextSortOrder(placement: { scheduled_for: string | null; window_kind: WindowKind | null; window_start: string | null }) {
    const contextItems = tasks.filter((task) => {
      if (placement.scheduled_for) return task.scheduled_for === placement.scheduled_for;
      if (placement.window_kind && placement.window_start) {
        return task.window_kind === placement.window_kind && task.window_start === placement.window_start;
      }
      return !task.scheduled_for && !task.window_kind && !task.window_start;
    });

    return contextItems.reduce((max, task) => Math.max(max, task.sort_order ?? 0), -1) + 1;
  }

  async function createTask() {
    const title = draftTitle.trim();
    if (!title || !projectId) return;

    const placement = buildPlacement(draftTarget);
    const sortOrder = getNextSortOrder(placement);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        notes: null,
        status: "open",
        project_goal_id: projectId,
        sort_order: sortOrder,
        ...placement,
      })
      .select("id,title,notes,status,scheduled_for,window_kind,window_start,project_goal_id,created_at,completed_at,sort_order")
      .single();

    if (error) return console.error(error);
    if (data) setTasks((prev) => [...prev, data as TaskRow]);
    setDraftTitle("");
  }

  async function updateTask(id: string, patch: Partial<TaskRow>) {
    setSavingId(id);
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    setSavingId(null);
    if (error) {
      console.error(error);
      await refreshTasks();
      return;
    }

    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } as TaskRow : task)));
  }

  async function toggleTaskDone(task: TaskRow) {
    const nextDone = task.status !== "done";
    await updateTask(task.id, {
      status: nextDone ? "done" : "open",
      completed_at: nextDone ? new Date().toISOString() : null,
    });
  }

  async function moveTask(task: TaskRow, targetValue: string) {
    const placement = buildPlacement(targetValue);
    await updateTask(task.id, {
      ...placement,
      sort_order: getNextSortOrder(placement),
    });
  }

  async function moveOpenTask(taskId: string, direction: -1 | 1) {
    const openTasks = tasks
      .filter((task) => task.status !== "done" && !task.scheduled_for && !task.window_kind && !task.window_start)
      .sort((a, b) => {
        if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    const index = openTasks.findIndex((task) => task.id === taskId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= openTasks.length) return;

    const current = openTasks[index];
    const target = openTasks[swapIndex];

    setSavingId(taskId);
    const [a, b] = await Promise.all([
      supabase.from("tasks").update({ sort_order: target.sort_order ?? 0 }).eq("id", current.id),
      supabase.from("tasks").update({ sort_order: current.sort_order ?? 0 }).eq("id", target.id),
    ]);
    setSavingId(null);

    if (a.error || b.error) {
      console.error(a.error ?? b.error);
      await refreshTasks();
      return;
    }

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === current.id) return { ...task, sort_order: target.sort_order };
        if (task.id === target.id) return { ...task, sort_order: current.sort_order };
        return task;
      })
    );
  }

  async function deleteTask(taskId: string) {
    setSavingId(taskId);
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    setSavingId(null);
    if (error) return console.error(error);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }

  async function saveProjectField(field: "actions" | "notes") {
    if (!project) return;

    setSavingProjectField(field);
    const { error } = await supabase
      .from("projects_goals")
      .update({ [field]: project[field] ?? "" })
      .eq("id", project.id);
    setSavingProjectField(null);

    if (error) {
      console.error(error);
      return;
    }
  }

  if (loading) {
    return (
      <main className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-5xl text-sm text-neutral-400">Loading project…</div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-5xl space-y-3">
          <button
            type="button"
            onClick={() => router.push("/goals")}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-200"
          >
            Back to Projects/Goals
          </button>
          <div className="text-sm text-neutral-400">Project not found.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full overflow-y-auto px-4 py-4 pb-[calc(100px+env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Link
              href="/goals"
              className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-200"
            >
              Back to Projects/Goals
            </Link>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                {project.bucket || "Project"}
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-100 sm:text-3xl">
                {project.goal || "(Untitled project)"}
              </h1>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-300">
            <div>{tasks.filter((task) => task.status !== "done").length} open tasks</div>
            <div className="mt-1 text-neutral-500">{tasks.filter((task) => task.status === "done").length} done</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Actions</div>
              {savingProjectField === "actions" && <div className="text-[11px] text-neutral-500">Saving…</div>}
            </div>
            <textarea
              value={project.actions ?? ""}
              onChange={(e) => setProject((prev) => (prev ? { ...prev, actions: e.target.value } : prev))}
              onBlur={() => void saveProjectField("actions")}
              placeholder="Project actions"
              rows={5}
              className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
            />
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Notes</div>
              {savingProjectField === "notes" && <div className="text-[11px] text-neutral-500">Saving…</div>}
            </div>
            <textarea
              value={project.notes ?? ""}
              onChange={(e) => setProject((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
              onBlur={() => void saveProjectField("notes")}
              placeholder="Project notes"
              rows={5}
              className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-100">Add Task</div>
            <button
              type="button"
              onClick={() => setShowComplete((value) => !value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200"
            >
              {showComplete ? "Hide complete" : "Show complete"}
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createTask();
                }
              }}
              placeholder="Add a project task"
              className="min-w-0 flex-1 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[16px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
            />
            <select
              value={draftTarget}
              onChange={(e) => setDraftTarget(e.target.value)}
              className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[16px] text-neutral-100 outline-none focus:border-neutral-600 sm:w-[220px]"
            >
              {moveTargets.map((target) => (
                <option key={target.value} value={target.value}>
                  {target.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void createTask()}
              className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {visibleTasks.length > 0 && (
            <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/70">
              <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 border-b border-neutral-800 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 sm:grid-cols-[minmax(0,1fr)_120px_320px] sm:px-5">
                <div>Task</div>
                <div>Date</div>
                <div className="hidden sm:block">Actions</div>
              </div>
              <div className="divide-y divide-neutral-800">
                {visibleTasks.map((task) => {
                  const openIndex = openTaskIds.indexOf(task.id);
                  const canMoveUp = openIndex > 0;
                  const canMoveDown = openIndex >= 0 && openIndex < openTaskIds.length - 1;
                  const isOpen = openIndex >= 0;
                  const isSaving = savingId === task.id;

                  return (
                    <div
                      key={task.id}
                      className={clsx(
                        "grid grid-cols-[minmax(0,1fr)_92px] gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_320px] sm:px-5",
                        isSaving && "opacity-60"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={task.status === "done"}
                            onChange={() => void toggleTaskDone(task)}
                            className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                          />
                          <div className="min-w-0">
                            <div className={clsx("text-sm font-medium text-neutral-100", task.status === "done" && "text-neutral-500 line-through")}>
                              {task.title}
                            </div>
                            {task.notes && (
                              <div className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">
                                {task.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="pt-0.5 text-sm text-neutral-300">
                        {dateLabelForTask(task, { todayIso, tomorrowIso, windows })}
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
                        {isOpen && (
                          <>
                            <button
                              type="button"
                              disabled={!canMoveUp}
                              onClick={() => void moveOpenTask(task.id, -1)}
                              className="rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-2 text-xs font-semibold text-neutral-200 disabled:opacity-40"
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              disabled={!canMoveDown}
                              onClick={() => void moveOpenTask(task.id, 1)}
                              className="rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-2 text-xs font-semibold text-neutral-200 disabled:opacity-40"
                            >
                              Down
                            </button>
                          </>
                        )}
                        <div className="w-[148px]">
                          {task.status !== "done" && (
                            <select
                              value={placementValueFor(task)}
                              onChange={(e) => void moveTask(task, e.target.value)}
                              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-200 outline-none sm:text-xs"
                            >
                              {moveTargets.map((target) => (
                                <option key={target.value} value={target.value}>
                                  {target.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteTask(task.id)}
                          className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {tasks.length === 0 && (
            <div className="rounded-3xl border border-dashed border-neutral-800 bg-neutral-900/40 px-5 py-8 text-center text-sm text-neutral-500">
              No tasks linked to this project yet.
            </div>
          )}
          {tasks.length > 0 && visibleTasks.length === 0 && (
            <div className="rounded-3xl border border-dashed border-neutral-800 bg-neutral-900/40 px-5 py-8 text-center text-sm text-neutral-500">
              No incomplete tasks. Use &quot;Show complete&quot; to see finished work.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
