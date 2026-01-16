"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteSession,
  listAllSessions,
  listRecentSessions,
  updateSession,
  WorkoutSessionRow,
} from "@/lib/db";


const WORKOUTS: { slug: string; label: string }[] = [
  { slug: "push-ups", label: "Push Ups" },
  { slug: "bicep-curls", label: "Bicep Curls" },

  { slug: "shoulder-press", label: "Shoulder Press" },
  { slug: "chest-press", label: "Chest Press" },

  { slug: "lateral-raise", label: "Lateral Raise" },
  { slug: "tricep-extension", label: "Tricep Extension" },

  { slug: "lat-pulldown", label: "Lat Pulldown" },
  { slug: "row", label: "Row" },

  { slug: "rear-delt-fly", label: "Rear Delt Fly" },
  { slug: "other", label: "Other" },

  { slug: "leg-press", label: "Leg Press" },
  { slug: "leg-curl", label: "Leg Curl" },
];

function labelForSlug(slug: string) {
  return WORKOUTS.find((w) => w.slug === slug)?.label ?? slug;
}

function parseIntOrNull(s: string) {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatOrNull(s: string) {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function compactFromFields(args: {
  slug: string;
  workoutName: string | null;
  weight: number | null;
  reps: Array<number | null>;
}) {
  const repsClean = args.reps.filter((x) => x != null) as number[];
  const repsStr = repsClean.join("/");

  if (args.slug === "push-ups") {
    return repsStr; // "10/10/10"
  }

  if (args.slug === "other") {
    const name = (args.workoutName ?? "").trim();
    const weightStr = args.weight != null ? String(args.weight) : "";
    // "Leg Extension - 80 - 12/12/12" (omit empty parts cleanly)
    return [name, weightStr, repsStr].filter((p) => p && p.trim()).join(" - ");
  }

  const weightStr = args.weight != null ? String(args.weight) : "";
  if (weightStr && repsStr) return `${weightStr} - ${repsStr}`;
  return weightStr || repsStr || "";
}

type EditForm = {
  performed_on: string;
  workout_slug: string;
  workout_name: string;
  weight: string;
  setsText: string[]; // len 6
  notes: string;
};

function rowToForm(r: WorkoutSessionRow): EditForm {
  return {
    performed_on: r.performed_on,
    workout_slug: r.workout_slug,
    workout_name: r.workout_name ?? "",
    weight: r.weight == null ? "" : String(r.weight),
    setsText: [
      r.set1_reps == null ? "" : String(r.set1_reps),
      r.set2_reps == null ? "" : String(r.set2_reps),
      r.set3_reps == null ? "" : String(r.set3_reps),
      r.set4_reps == null ? "" : String(r.set4_reps),
      r.set5_reps == null ? "" : String(r.set5_reps),
      r.set6_reps == null ? "" : String(r.set6_reps),
    ],
    notes: r.notes ?? "",
  };
}

export default function DataPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkoutSessionRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listRecentSessions(100);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkoutSessionRow[]>();
    for (const r of rows) {
      const key = r.performed_on;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()); // already in order because rows are ordered
  }, [rows]);

  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows]
  );

  const compactPreview = useMemo(() => {
    if (!form) return "";
    const reps = form.setsText.map(parseIntOrNull);
    const weight = parseFloatOrNull(form.weight);
    const name = form.workout_slug === "other" ? form.workout_name.trim() : null;
    return compactFromFields({
      slug: form.workout_slug,
      workoutName: name,
      weight,
      reps,
    });
  }, [form]);

  function startEdit(r: WorkoutSessionRow) {
    setEditingId(r.id);
    setForm(rowToForm(r));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
  }

  async function saveEdit() {
    if (!editingId || !form) return;

    const reps = form.setsText.map(parseIntOrNull);
    const weight = parseFloatOrNull(form.weight);
    const workout_name =
      form.workout_slug === "other" ? (form.workout_name.trim() || null) : null;

    const compact = compactFromFields({
      slug: form.workout_slug,
      workoutName: workout_name,
      weight,
      reps,
    });

    setSaving(true);
    try {
      await updateSession(editingId, {
        performed_on: form.performed_on,
        workout_slug: form.workout_slug,
        workout_name,
        weight,
        set1_reps: reps[0] ?? null,
        set2_reps: reps[1] ?? null,
        set3_reps: reps[2] ?? null,
        set4_reps: reps[3] ?? null,
        set5_reps: reps[4] ?? null,
        set6_reps: reps[5] ?? null,
        notes: form.notes.trim() ? form.notes.trim() : null,
        compact,
      });

      // update local list without full reload
      setRows((prev) =>
        prev.map((r) =>
          r.id !== editingId
            ? r
            : {
                ...r,
                performed_on: form.performed_on,
                workout_slug: form.workout_slug,
                workout_name,
                weight,
                set1_reps: reps[0] ?? null,
                set2_reps: reps[1] ?? null,
                set3_reps: reps[2] ?? null,
                set4_reps: reps[3] ?? null,
                set5_reps: reps[4] ?? null,
                set6_reps: reps[5] ?? null,
                notes: form.notes.trim() ? form.notes.trim() : null,
                compact,
              }
        )
      );

      cancelEdit();
    } catch (e: any) {
      alert(`Save failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: string) {
    // tiny safety — one click confirm
    if (!confirm("Delete this session?")) return;

    try {
      await deleteSession(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e: any) {
      alert(`Delete failed: ${e?.message ?? e}`);
    }
  }

function csvEscape(v: unknown) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportCsv() {
  setExporting(true);
  try {
    const all = await listAllSessions(); // FULL table, not just last 100

    // Stable column order (no IDs)
    const headers = [
      "performed_on",
      "workout_slug",
      "workout_name",
      "weight",
      "set1_reps",
      "set2_reps",
      "set3_reps",
      "set4_reps",
      "set5_reps",
      "set6_reps",
      "compact",
      "notes",
      "created_at",
    ];

    const lines: string[] = [];
    lines.push(headers.join(","));

    for (const r of all) {
      const row = headers.map((h) => csvEscape((r as any)[h]));
      lines.push(row.join(","));
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `workout-sessions-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  } catch (e: any) {
    alert(`Export failed: ${e?.message ?? e}`);
  } finally {
    setExporting(false);
  }
}



  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-center w-full">
            Data
          </h1>
        </div>

      <div className="mt-3 flex items-center justify-center">
        <button
          onClick={exportCsv}
          disabled={exporting || loading}
          className="text-sm text-white/70 underline underline-offset-4 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

        {loading ? (
          <div className="mt-8 text-center text-white/60">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="mt-8 text-center text-white/60">No sessions yet.</div>
        ) : (
          <div className="mt-6 space-y-6">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div className="mb-2 text-xs uppercase tracking-wider text-white/50">
                  {date}
                </div>

                <div className="space-y-3">
                  {items.map((r) => {
                    const title =
                      r.workout_slug === "other"
                        ? r.workout_name || "Other"
                        : labelForSlug(r.workout_slug);

                    const isEditing = editingId === r.id;

                    return (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            onClick={() => (isEditing ? cancelEdit() : startEdit(r))}
                            className="text-left flex-1"
                          >
                            <div className="text-lg font-semibold">{title}</div>
                            <div className="mt-1 text-white/80">{r.compact}</div>
                            {r.notes ? (
                              <div className="mt-1 text-sm text-white/60 line-clamp-1">
                                {r.notes}
                              </div>
                            ) : null}
                          </button>

                          <button
                            onClick={() => doDelete(r.id)}
                            className="h-10 px-3 rounded-xl border border-white/10 bg-black/20 text-sm text-white/70"
                          >
                            Delete
                          </button>
                        </div>

                        {isEditing && form && editingRow ? (
                          <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
                            <div>
                              <div className="text-xs text-white/60 mb-1 text-center">
                                Date
                              </div>
                              <input
                                type="date"
                                value={form.performed_on}
                                onChange={(e) =>
                                  setForm({ ...form, performed_on: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center outline-none focus:border-white/20"
                              />
                            </div>

                            <div>
                              <div className="text-xs text-white/60 mb-1 text-center">
                                Workout
                              </div>
                              <select
                                value={form.workout_slug}
                                onChange={(e) =>
                                  setForm({ ...form, workout_slug: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center outline-none focus:border-white/20"
                              >
                                {WORKOUTS.map((w) => (
                                  <option key={w.slug} value={w.slug}>
                                    {w.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {form.workout_slug === "other" ? (
                              <div>
                                <div className="text-xs text-white/60 mb-1 text-center">
                                  Other workout name
                                </div>
                                <input
                                  value={form.workout_name}
                                  onChange={(e) =>
                                    setForm({ ...form, workout_name: e.target.value })
                                  }
                                  className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center outline-none focus:border-white/20"
                                />
                              </div>
                            ) : null}

                            <div>
                              <div className="text-xs text-white/60 mb-1 text-center">
                                Weight
                              </div>
                              <input
                                inputMode="decimal"
                                value={form.weight}
                                onChange={(e) =>
                                  setForm({ ...form, weight: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center outline-none focus:border-white/20"
                              />
                            </div>

                            <div>
                              <div className="text-xs text-white/60 mb-2 text-center">
                                Sets
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {form.setsText.map((v, i) => (
                                  <input
                                    key={i}
                                    inputMode="numeric"
                                    value={v}
                                    onChange={(e) => {
                                      const next = [...form.setsText];
                                      next[i] = e.target.value.replace(/[^\d]/g, "");
                                      setForm({ ...form, setsText: next });
                                    }}
                                    placeholder={`Set ${i + 1}`}
                                    className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 text-center outline-none focus:border-white/20"
                                  />
                                ))}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-white/60 mb-1 text-center">
                                Notes
                              </div>
                              <textarea
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                rows={2}
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-white/20"
                              />
                            </div>

                            <div className="text-center text-sm text-white/60">
                              Preview: <span className="text-white/80">{compactPreview}</span>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={cancelEdit}
                                className="h-12 flex-1 rounded-xl border border-white/10 bg-black/20 text-white/80"
                                disabled={saving}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveEdit}
                                className="h-12 flex-1 rounded-xl bg-white text-black font-semibold active:scale-[0.99]"
                                disabled={saving}
                              >
                                {saving ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}