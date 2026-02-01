"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

type GoalRow = {
  id: string;
  created_at: string;
  bucket: string;
  goal: string;
  rating: number | null;
  actions: string | null;
  notes: string | null;
  sort_order: number;
  archived: boolean;
};

type Task = {
  id: string;
  title: string;
  status: "open" | "done" | "canceled";
  scheduled_for: string | null;
};

type Plan = {
  id: string;
  title: string;
  status: "open" | "done" | "canceled";
  scheduled_for: string | null;
  starts_at: string | null;
};

type Focus = {
  id: string;
  title: string;
  status: "active" | "archived";
  scheduled_for: string | null;
};

const DEFAULT_BUCKET_ORDER = ["Baseline", "Growth", "Progress", "Project"];

function clampRating(v: number) {
  if (Number.isNaN(v)) return v;
  return Math.max(1, Math.min(5, v));
}

function fmtRating(v: number | null) {
  if (v === null || typeof v === "undefined") return "–";
  // keep one decimal if needed
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function sortGoals(goals: GoalRow[], bucketOrder: string[]) {
  const idx = new Map(bucketOrder.map((b, i) => [b, i] as const));
  return [...goals].sort((a, b) => {
    const ai = idx.has(a.bucket) ? (idx.get(a.bucket) as number) : 999;
    const bi = idx.has(b.bucket) ? (idx.get(b.bucket) as number) : 999;
    if (ai !== bi) return ai - bi;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function Textarea({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={3}
      className={clsx(
        "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2",
        "text-[16px] text-neutral-100 placeholder:text-neutral-600 outline-none",
        "focus:border-neutral-600",
        className
      )}
    />
  );
}

function Input({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  type = "text",
  step,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  type?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      className={clsx(
        "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2",
        "text-[16px] text-neutral-100 placeholder:text-neutral-600 outline-none",
        "focus:border-neutral-600",
        className
      )}
    />
  );
}

function Select({
  value,
  onChange,
  onBlur,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  options: string[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={clsx(
        "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2",
        "text-[16px] text-neutral-100 outline-none",
        "focus:border-neutral-600",
        className
      )}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function LinkedItemsSheet({
  open,
  goal,
  tasks,
  plans,
  focuses,
  loading,
  onClose,
}: {
  open: boolean;
  goal: GoalRow | null;
  tasks: Task[];
  plans: Plan[];
  focuses: Focus[];
  loading: boolean;
  onClose: () => void;
}) {
  if (!open || !goal) return null;

  const totalCount = tasks.length + plans.length + focuses.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-neutral-950 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">{goal.goal}</h2>
            {goal.bucket && <p className="text-sm text-neutral-400">{goal.bucket}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="py-8 text-center text-neutral-400">Loading...</div>
          ) : totalCount === 0 ? (
            <div className="py-8 text-center text-neutral-500">
              No items linked to this goal yet.
            </div>
          ) : (
            <div className="space-y-6">
              {tasks.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-300">Tasks ({tasks.length})</h3>
                  <div className="space-y-1">
                    {tasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                      >
                        <span className={clsx(
                          "text-sm",
                          t.status === "done" ? "text-neutral-500 line-through" : "text-neutral-100"
                        )}>
                          {t.title}
                        </span>
                        {t.scheduled_for && (
                          <span className="ml-auto text-xs text-neutral-500">
                            {new Date(t.scheduled_for).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {plans.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-300">Plans ({plans.length})</h3>
                  <div className="space-y-1">
                    {plans.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                      >
                        <span className={clsx(
                          "text-sm",
                          p.status === "done" ? "text-neutral-500 line-through" : "text-neutral-100"
                        )}>
                          {p.title}
                        </span>
                        {p.scheduled_for && (
                          <span className="ml-auto text-xs text-neutral-500">
                            {new Date(p.scheduled_for).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {focuses.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-300">Intentions ({focuses.length})</h3>
                  <div className="space-y-1">
                    {focuses.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                      >
                        <span className="text-sm text-neutral-100">{f.title}</span>
                        {f.scheduled_for && (
                          <span className="ml-auto text-xs text-neutral-500">
                            {new Date(f.scheduled_for).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-800 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-100 hover:bg-neutral-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type LinkedItem = {
  id: string;
  title: string;
  type: "task" | "plan" | "focus";
  status?: string;
  scheduled_for: string | null;
};

function EditSheet({
  open,
  title,
  initial,
  bucketOptions,
  onClose,
  onSave,
  onArchiveToggle,
  onDelete,
}: {
  open: boolean;
  title: string;
  initial: GoalRow | null;
  bucketOptions: string[];
  onClose: () => void;
  onSave: (patch: Partial<GoalRow>) => Promise<void>;
  onArchiveToggle: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<GoalRow | null>(initial);
  const [saving, setSaving] = useState(false);
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);

  useEffect(() => {
    setDraft(initial);
    setSaving(false);

    // Load linked items when opening
    async function loadLinkedItems() {
      if (!initial?.id) {
        setLinkedItems([]);
        return;
      }

      setLoadingLinked(true);
      try {
        const [tasksRes, plansRes, focusesRes] = await Promise.all([
          supabase.from("tasks").select("id, title, status, scheduled_for").eq("project_goal_id", initial.id).in("status", ["open", "done"]),
          supabase.from("plans").select("id, title, status, scheduled_for").eq("project_goal_id", initial.id).in("status", ["open", "done"]),
          supabase.from("focuses").select("id, title, status, scheduled_for").eq("project_goal_id", initial.id).eq("status", "active"),
        ]);

        const items: LinkedItem[] = [
          ...(tasksRes.data ?? []).map(t => ({ ...t, type: "task" as const })),
          ...(plansRes.data ?? []).map(p => ({ ...p, type: "plan" as const })),
          ...(focusesRes.data ?? []).map(f => ({ ...f, type: "focus" as const })),
        ];

        items.sort((a, b) => {
          if (a.scheduled_for && b.scheduled_for) {
            return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
          }
          if (a.scheduled_for) return -1;
          if (b.scheduled_for) return 1;
          return 0;
        });
        setLinkedItems(items);
      } finally {
        setLoadingLinked(false);
      }
    }

    if (open && initial) {
      loadLinkedItems();
    } else {
      setLinkedItems([]);
    }
  }, [initial, open]);

  if (!open || !draft) return null;

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await onSave({
        bucket: draft.bucket,
        goal: draft.goal,
        rating: draft.rating,
        actions: draft.actions,
        notes: draft.notes,
        sort_order: draft.sort_order,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90]">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-2xl rounded-t-3xl border border-neutral-800 bg-neutral-950 shadow-2xl flex flex-col max-h-[85dvh]">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <div className="text-base font-semibold text-neutral-100">{title}</div>
          <button
            className={clsx(
              "rounded-xl px-3 py-2 text-sm font-semibold",
              saving
                ? "bg-neutral-800 text-neutral-400"
                : "bg-neutral-100 text-neutral-950"
            )}
            disabled={saving}
            onClick={handleSave}
          >
            Save
          </button>
        </div>

        <div className="overflow-y-auto px-5 flex-1 min-h-0">
          <div className="space-y-3 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-400">Bucket</div>
              <Select
                value={draft.bucket}
                onChange={(v) => setDraft({ ...draft, bucket: v })}
                options={bucketOptions}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-400">Rating</div>
              <Input
                type="number"
                step={0.5}
                min={1}
                max={5}
                value={draft.rating === null ? "" : String(draft.rating)}
                onChange={(v) => {
                  if (v.trim() === "") return setDraft({ ...draft, rating: null });
                  const n = clampRating(Number(v));
                  setDraft({ ...draft, rating: Number.isFinite(n) ? n : draft.rating });
                }}
                placeholder="1–5"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-neutral-400">Goal</div>
            <Input
              value={draft.goal}
              onChange={(v) => setDraft({ ...draft, goal: v })}
              placeholder="e.g., Daily TM"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-neutral-400">Actions</div>
            <Textarea
              value={draft.actions ?? ""}
              onChange={(v) => setDraft({ ...draft, actions: v })}
              placeholder="Bullets / next steps…"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-neutral-400">Notes</div>
            <Textarea
              value={draft.notes ?? ""}
              onChange={(v) => setDraft({ ...draft, notes: v })}
              placeholder="Review notes…"
            />
          </div>

          {/* Linked Items Section */}
          <div>
            <div className="mb-2 text-xs font-semibold text-neutral-400">
              Linked Items ({linkedItems.length})
            </div>
            {loadingLinked ? (
              <div className="text-xs text-neutral-500">Loading linked items…</div>
            ) : linkedItems.length === 0 ? (
              <div className="text-xs text-neutral-500">No linked items yet.</div>
            ) : (
              <div className="space-y-1.5">
                {linkedItems.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2"
                  >
                    <div className="shrink-0 rounded-md border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      {item.type === "task" ? "Task" : item.type === "plan" ? "Plan" : "Intent"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={clsx(
                        "text-sm",
                        item.status === "done" ? "text-neutral-500 line-through" : "text-neutral-200"
                      )}>
                        {item.title}
                      </div>
                      {item.scheduled_for && (
                        <div className="mt-0.5 text-[11px] text-neutral-500">
                          {new Date(item.scheduled_for).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>

        <div className="shrink-0 p-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
              onClick={async () => {
                if (saving) return;
                const ok = confirm(draft.archived ? "Unarchive this goal?" : "Archive this goal?");
                if (!ok) return;
                setSaving(true);
                try {
                  await onArchiveToggle();
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
            >
              {draft.archived ? "Unarchive" : "Archive"}
            </button>
            <button
              className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200"
              onClick={async () => {
                if (saving) return;
                const ok = confirm("Delete this goal? This cannot be undone.");
                if (!ok) return;
                setSaving(true);
                try {
                  await onDelete();
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
            >
              Delete
            </button>
          </div>

          <button
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
            onClick={() => {
              if (!saving) onClose();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => goals.find((g) => g.id === editingId) ?? null,
    [goals, editingId]
  );

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [linkedPlans, setLinkedPlans] = useState<Plan[]>([]);
  const [linkedFocuses, setLinkedFocuses] = useState<Focus[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);

  // track saves per-row so we can show subtle feedback
  const savingIdsRef = useRef(new Set<string>());
  const [, forceTick] = useState(0);

  const bucketOptions = useMemo(() => {
    const existing = Array.from(new Set(goals.map((g) => g.bucket))).filter(Boolean);
    const merged = Array.from(new Set([...DEFAULT_BUCKET_ORDER, ...existing]));
    return merged.length ? merged : DEFAULT_BUCKET_ORDER;
  }, [goals]);

  async function loadGoals() {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects_goals")
      .select("id, created_at, bucket, goal, rating, actions, notes, sort_order, archived")
      .order("bucket", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error) setGoals((data as GoalRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadGoals();
  }, []);

  async function loadLinkedItems(goalId: string) {
    setLoadingLinked(true);
    const [tasksRes, plansRes, focusesRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,status,scheduled_for")
        .eq("project_goal_id", goalId)
        .in("status", ["open", "done"])
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("plans")
        .select("id,title,status,scheduled_for,starts_at")
        .eq("project_goal_id", goalId)
        .in("status", ["open", "done"])
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("focuses")
        .select("id,title,status,scheduled_for")
        .eq("project_goal_id", goalId)
        .eq("status", "active")
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);

    setLinkedTasks((tasksRes.data as Task[]) ?? []);
    setLinkedPlans((plansRes.data as Plan[]) ?? []);
    setLinkedFocuses((focusesRes.data as Focus[]) ?? []);
    setLoadingLinked(false);
  }

  useEffect(() => {
    if (selectedGoalId) {
      loadLinkedItems(selectedGoalId);
    } else {
      setLinkedTasks([]);
      setLinkedPlans([]);
      setLinkedFocuses([]);
    }
  }, [selectedGoalId]);

  const visibleGoals = useMemo(() => {
    const filtered = goals.filter((g) => (showArchived ? true : !g.archived));
    return sortGoals(filtered, bucketOptions);
  }, [goals, showArchived, bucketOptions]);

  const grouped = useMemo(() => {
    const map = new Map<string, GoalRow[]>();
    for (const g of visibleGoals) {
      const key = g.bucket || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return map;
  }, [visibleGoals]);

  async function createGoal() {
    const bucket = bucketOptions[0] ?? "Baseline";
    const currentMaxSort = Math.max(
      0,
      ...goals.filter((g) => g.bucket === bucket).map((g) => g.sort_order)
    );

    const { data, error } = await supabase
      .from("projects_goals")
      .insert({ bucket, goal: "", rating: null, actions: "", notes: "", sort_order: currentMaxSort + 1, archived: false })
      .select("id, created_at, bucket, goal, rating, actions, notes, sort_order, archived")
      .single();

    if (error || !data) return;
    setGoals((prev) => [...prev, data as GoalRow]);
    setEditingId((data as GoalRow).id);
  }

  async function patchGoal(id: string, patch: Partial<GoalRow>) {
    savingIdsRef.current.add(id);
    forceTick((t) => t + 1);

    setGoals((prev) => prev.map((g) => (g.id === id ? ({ ...g, ...patch } as GoalRow) : g)));

    const { error } = await supabase.from("projects_goals").update(patch).eq("id", id);

    savingIdsRef.current.delete(id);
    forceTick((t) => t + 1);

    // if save failed, reload from server to be safe
    if (error) await loadGoals();
  }

  async function deleteGoal(id: string) {
    const { error } = await supabase.from("projects_goals").delete().eq("id", id);
    if (error) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }



  return (
    <main className="h-full w-full max-w-full overflow-y-auto overflow-x-hidden px-4 py-4 pb-[calc(100px+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-6xl">
      <div className="flex items-center justify-end gap-2">
        <button
          className="rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-200"
          onClick={() => setShowArchived((s) => !s)}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
        <button
          className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-950"
          onClick={createGoal}
        >
          Add
        </button>
      </div>

      {/* Desktop / iPad landscape: editable table */}
      <div className="mt-5 hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
          <div className="grid grid-cols-[140px_1.2fr_90px_1.2fr_1.3fr_80px] gap-0 border-b border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs font-semibold text-neutral-300">
            <div>Bucket</div>
            <div>Goal</div>
            <div>Rating</div>
            <div>Actions</div>
            <div>Notes</div>
            <div className="text-right"> </div>
          </div>

          {loading ? (
            <div className="px-4 py-6 text-sm text-neutral-400">Loading…</div>
          ) : visibleGoals.length === 0 ? (
            <div className="px-4 py-6 text-sm text-neutral-400">No goals yet.</div>
          ) : (
            <div>
              {visibleGoals.map((g) => (
                <div
                  key={g.id}
                  className={clsx(
                    "grid grid-cols-[140px_1.2fr_90px_1.2fr_1.3fr_80px] gap-0 border-b border-neutral-800 last:border-b-0",
                    "px-3 py-3",
                    g.archived && "opacity-60"
                  )}
                >
                  <div className="pr-3">
                    <div
                      className={clsx(
                        "text-sm font-semibold text-neutral-200",
                        "truncate"
                      )}
                      title={g.bucket}
                    >
                      {g.bucket}
                    </div>
                  </div>

                  <div className="pr-3">
                    <button
                      type="button"
                      onClick={() => setSelectedGoalId(g.id)}
                      className={clsx(
                        "w-full text-left",
                        "text-sm font-semibold text-neutral-100",
                        "truncate hover:underline"
                      )}
                      title={g.goal || "(Untitled)"}
                    >
                      {g.goal || "(Untitled)"}
                    </button>
                  </div>

                  <div className="pr-3">
                    <Input
                      type="number"
                      step={0.5}
                      min={1}
                      max={5}
                      value={g.rating === null ? "" : String(g.rating)}
                      onChange={(v) => {
                        if (v.trim() === "") {
                          setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, rating: null } : x)));
                          return;
                        }
                        const n = clampRating(Number(v));
                        if (!Number.isFinite(n)) return;
                        setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, rating: n } : x)));
                      }}
                      onBlur={() => patchGoal(g.id, { rating: g.rating })}
                      placeholder=""
                      className="text-sm"
                    />
                  </div>

                  <div className="pr-3">
                    <Textarea
                      value={g.actions ?? ""}
                      onChange={(v) => setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, actions: v } : x)))}
                      onBlur={() => patchGoal(g.id, { actions: g.actions ?? "" })}
                      placeholder=""
                      className="text-sm"
                    />
                  </div>

                  <div className="pr-3">
                    <Textarea
                      value={g.notes ?? ""}
                      onChange={(v) => setGoals((prev) => prev.map((x) => (x.id === g.id ? { ...x, notes: v } : x)))}
                      onBlur={() => patchGoal(g.id, { notes: g.notes ?? "" })}
                      placeholder=""
                      className="text-sm"
                    />
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      className={clsx(
                        "w-[84px] rounded-xl border px-2 py-2 text-xs font-semibold",
                        g.archived
                          ? "border-neutral-700 bg-neutral-950/40 text-neutral-300"
                          : "border-neutral-800 bg-neutral-950/20 text-neutral-200"
                      )}
                      onClick={() => patchGoal(g.id, { archived: !g.archived })}
                      title={g.archived ? "Unarchive" : "Archive"}
                    >
                      {g.archived ? "Unarchive" : "Archive"}
                    </button>

                    <button
                      className="w-[84px] rounded-xl border border-red-900/40 bg-red-950/20 px-2 py-2 text-xs font-semibold text-red-200"
                      onClick={async () => {
                        const ok = confirm("Delete this goal? This cannot be undone.");
                        if (!ok) return;
                        await deleteGoal(g.id);
                      }}
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* iPhone / portrait: bucket sections with edit sheet */}
      <div className="mt-5 md:hidden">
        {loading ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : visibleGoals.length === 0 ? (
          <div className="text-sm text-neutral-400">No goals yet.</div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([bucket, items]) => (
              <div key={bucket} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
                <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {bucket}
                </div>
                <div className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
                  {items.map((g) => (
                    <button
                      key={g.id}
                      className={clsx(
                        "w-full text-left px-3 py-3",
                        "bg-neutral-950/20 hover:bg-neutral-950/30",
                        g.archived && "opacity-60"
                      )}
                      onClick={() => setEditingId(g.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[16px] font-semibold text-neutral-100">
                            {g.goal || "(Untitled goal)"}
                          </div>
                          <div className="mt-1 truncate text-xs text-neutral-500">
                            {(g.actions ?? "").replace(/\n/g, " • ")}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-xl border border-neutral-800 bg-neutral-950/40 px-2 py-1 text-xs font-semibold text-neutral-200">
                          {fmtRating(g.rating)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          className="mt-4 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950"
          onClick={createGoal}
        >
          Add
        </button>
      </div>

      <LinkedItemsSheet
        open={Boolean(selectedGoalId)}
        goal={goals.find((g) => g.id === selectedGoalId) ?? null}
        tasks={linkedTasks}
        plans={linkedPlans}
        focuses={linkedFocuses}
        loading={loadingLinked}
        onClose={() => setSelectedGoalId(null)}
      />

      <EditSheet
        open={Boolean(editingId && editing)}
        title="Edit"
        initial={editing}
        bucketOptions={bucketOptions}
        onClose={() => setEditingId(null)}
        onSave={async (patch) => {
          if (!editing) return;
          await patchGoal(editing.id, patch);
        }}
        onArchiveToggle={async () => {
          if (!editing) return;
          await patchGoal(editing.id, { archived: !editing.archived });
        }}
        onDelete={async () => {
          if (!editing) return;
          await deleteGoal(editing.id);
        }}
      />
    </main>
  );
}
