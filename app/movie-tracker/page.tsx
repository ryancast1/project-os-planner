"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const actions = [
  { label: "Add a Movie", href: "/movie-tracker/add", variant: "primary" as const },
  { label: "View Watchlist", href: "/movie-tracker/watchlist", variant: "secondary" as const },
  { label: "Watched Movies", href: "/movie-tracker/watched", variant: "secondary" as const },
];

type MovieRow = {
  id: string;
  title: string;
  year: number | null;
  length_minutes: number | null;
  priority: number | null;
  status: "to_watch" | "watched";
  category: "movie" | "documentary" | null;
  source: string | null;
  location: string | null;
  note: string | null;
};

function minutesToHhMm(mins: number | null): string {
  if (!mins || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `0:${String(m).padStart(2, "0")}`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function parseLengthToMinutes(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  // Accept HH:MM or H:MM
  if (t.includes(":")) {
    const [a, b] = t.split(":");
    const h = Number(a);
    const m = Number(b);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || m < 0 || m >= 60) return null;
    return h * 60 + m;
  }
  // Accept plain minutes
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function HomePage() {
  const [rows, setRows] = useState<MovieRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editYear, setEditYear] = useState<string>("");
  const [editLength, setEditLength] = useState<string>("");
  const [editPriority, setEditPriority] = useState<string>("");
  const [editCategory, setEditCategory] = useState<"movie" | "documentary" | "">("");
  const [editSource, setEditSource] = useState<string>("");
  const [editLocation, setEditLocation] = useState<string>("");
  const [editNote, setEditNote] = useState<string>("");

  // watched modal
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [watchedDate, setWatchedDate] = useState<string>(todayISO());
  const [watchedNote, setWatchedNote] = useState<string>("");
  const watchingRow = useMemo(
    () => rows.find((r) => r.id === watchingId) ?? null,
    [rows, watchingId]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("movie_tracker")
        .select("id,title,year,length_minutes,priority,status,category,source,location,note")
        .eq("status", "to_watch")
        .not("priority", "is", null)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as MovieRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxNon99Priority = useMemo(() => {
    let max = -1;
    for (const r of rows) {
      if (r.priority === null) continue;
      if (r.priority === 99) continue;
      if (r.priority > max) max = r.priority;
    }
    return max;
  }, [rows]);

  function sortOnDeck(list: MovieRow[]): MovieRow[] {
    return [...list].sort((a, b) => {
      const ap = a.priority ?? 999999;
      const bp = b.priority ?? 999999;
      if (ap !== bp) return ap - bp;
      // Stable-ish tie-breaker so things don't jump around too much
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
  }

  async function movePriority(id: string, direction: "up" | "down") {
    const me = rows.find((r) => r.id === id);
    if (!me) return;

    const p = me.priority;
    if (p === null) return;

    // 99 rules
    if (p === 99) {
      if (direction === "down") {
        // drop off list
        const { error } = await supabase
          .from("movie_tracker")
          .update({ priority: null })
          .eq("id", id);
        if (error) {
          alert(`Move failed: ${error.message}`);
          await load();
          return;
        }

        setRows((prev) => prev.filter((r) => r.id !== id));
        return;
      }

      // up: becomes one higher than highest non-99 (or 1 if none)
      const newP = Math.max(1, maxNon99Priority + 1);
      const { error } = await supabase
        .from("movie_tracker")
        .update({ priority: newP })
        .eq("id", id);
      if (error) {
        alert(`Move failed: ${error.message}`);
        await load();
        return;
      }

      setRows((prev) => sortOnDeck(prev.map((r) => (r.id === id ? { ...r, priority: newP } : r))));
      return;
    }

    // bounds: priority 1 is the highest
if (p === 1 && direction === "up") return;

const target = direction === "up" ? p - 1 : p + 1;

const sameCount = rows.filter((r) => r.status === "to_watch" && r.priority === p).length;

// NEW: if this movie is the *only* one at the current highest non-99 priority,
// a single DOWN click should demote it directly to On Deck (99).
if (direction === "down" && p === maxNon99Priority && sameCount === 1) {
  const newP = 99;

  // optimistic UI update (keeps scroll position)
  setRows((prev) =>
    sortOnDeck(prev.map((r) => (r.id === id ? { ...r, priority: newP } : r)))
  );

  const { error: e2 } = await supabase
    .from("movie_tracker")
    .update({ priority: newP })
    .eq("id", id);

  if (e2) {
    alert(`Move failed: ${e2.message}`);
    await load();
  }
  return;
}

const targetCount = rows.filter((r) => r.status === "to_watch" && r.priority === target).length;

// Only swap if BOTH sides are singletons (exactly 1 in current priority and 1 in target priority).
const shouldSwap = sameCount === 1 && targetCount === 1;

// If either side is a batch (or there is no target movie), only move the clicked movie.
if (!shouldSwap) {
  // optimistic UI update (no loading flip, keeps scroll position)
  setRows((prev) =>
    sortOnDeck(prev.map((r) => (r.id === id ? { ...r, priority: target } : r)))
  );

  const { error: e2 } = await supabase
    .from("movie_tracker")
    .update({ priority: target })
    .eq("id", id);

  if (e2) {
    alert(`Move failed: ${e2.message}`);
    await load();
  }
  return;
}

// Swap with the single movie at the target priority.
const targetRowId = rows.find((r) => r.status === "to_watch" && r.priority === target)?.id;
if (!targetRowId) {
  // Shouldn't happen because shouldSwap implies there's exactly one target, but guard anyway.
  await load();
  return;
}

// optimistic UI update
setRows((prev) =>
  sortOnDeck(
    prev.map((r) => {
      if (r.id === id) return { ...r, priority: target };
      if (r.id === targetRowId) return { ...r, priority: p };
      return r;
    })
  )
);

try {
  const { error: e1 } = await supabase
    .from("movie_tracker")
    .update({ priority: p })
    .eq("id", targetRowId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("movie_tracker")
    .update({ priority: target })
    .eq("id", id);
  if (e2) throw e2;

  // No full reload: UI already updated.
} catch (e: any) {
  alert(`Move failed: ${e?.message ?? "Unknown error"}`);
  await load();
}
  }

  function openEditModal(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    setEditingId(id);
    setEditTitle(r.title ?? "");
    setEditYear(r.year ? String(r.year) : "");
    setEditLength(r.length_minutes ? minutesToHhMm(r.length_minutes) : "");
    setEditPriority(r.priority === null ? "" : String(r.priority));
    setEditCategory(r.category ?? "");
    setEditSource(r.source ?? "");
    setEditLocation(r.location ?? "");
    setEditNote(r.note ?? "");
  }

  async function saveEdits() {
    if (!editingId) return;
    const title = editTitle.trim();
    if (!title) {
      alert("Title is required");
      return;
    }

    const yearNum = editYear.trim() ? Number(editYear.trim()) : null;
    if (editYear.trim() && (!Number.isFinite(yearNum) || yearNum! < 1800 || yearNum! > 3000)) {
      alert("Year must be a valid number");
      return;
    }

    const lenMins = parseLengthToMinutes(editLength);
    if (editLength.trim() && lenMins === null) {
      alert("Length must be minutes or H:MM");
      return;
    }

    const pr = editPriority.trim() === "" ? null : Number(editPriority.trim());
    if (editPriority.trim() !== "" && (!Number.isFinite(pr) || pr! < 0)) {
      alert("Priority must be blank or a non-negative number");
      return;
    }

    const payload: any = {
      title,
      year: yearNum,
      length_minutes: lenMins,
      priority: pr,
      category: editCategory === "" ? null : editCategory,
      source: editSource.trim() ? editSource.trim() : null,
      location: editLocation.trim() ? editLocation.trim() : null,
      note: editNote.trim() ? editNote.trim() : null,
    };

    const { error } = await supabase.from("movie_tracker").update(payload).eq("id", editingId);
    if (error) {
      alert(`Save failed: ${error.message}`);
      return;
    }

    setEditingId(null);
    await load();
  }

  async function deleteMovie(id: string) {
    const ok = confirm("Delete this movie?");
    if (!ok) return;
    const { error } = await supabase.from("movie_tracker").delete().eq("id", id);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }
    if (expandedId === id) setExpandedId(null);
    if (watchingId === id) setWatchingId(null);
    if (editingId === id) setEditingId(null);
    await load();
  }

  function openWatchedModal(id: string) {
    setWatchingId(id);
    setWatchedDate(todayISO());
    setWatchedNote("");
  }

  async function confirmMarkWatched() {
    if (!watchingRow) {
      setWatchingId(null);
      return;
    }

    // capture the priority before we null it out
    const watchedPriority = watchingRow.priority;

    const extra = watchedNote.trim();
    const existing = (watchingRow.note ?? "").trim();
    const mergedNote =
      extra.length === 0
        ? existing.length === 0
          ? null
          : existing
        : existing.length === 0
          ? extra
          : `${existing}\n${extra}`;

    const payload: any = {
      status: "watched",
      date_watched: watchedDate,
      priority: null,
      note: mergedNote,
    };

    const { error } = await supabase
      .from("movie_tracker")
      .update(payload)
      .eq("id", watchingRow.id);

    if (error) {
      alert(`Mark watched failed: ${error.message}`);
      return;
    }

    // Close the modal immediately
    setWatchingId(null);

    // Rebalance priorities: close the gap by decrementing all priorities above the watched one
    // (ignore null and OD=99)
    if (watchedPriority !== null && watchedPriority !== 99) {
      try {
        const { data: affected, error: selErr } = await supabase
          .from("movie_tracker")
          .select("id,priority")
          .eq("status", "to_watch")
          .not("priority", "is", null)
          .neq("priority", 99)
          .gt("priority", watchedPriority);

        if (selErr) throw selErr;

        const updates = (affected ?? []).map((r: any) => {
          const nextP = Math.max(0, (r.priority as number) - 1);
          return supabase.from("movie_tracker").update({ priority: nextP }).eq("id", r.id);
        });

        if (updates.length > 0) {
          const results = await Promise.all(updates);
          const firstErr = results.find((res: any) => res?.error)?.error;
          if (firstErr) throw firstErr;
        }
      } catch (e: any) {
        alert(`Priority rebalance failed: ${e?.message ?? "Unknown error"}`);
      }
    }

    await load();
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-3 sm:px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl">
        <header className="mb-6 relative">
          <h1 className="text-3xl font-semibold tracking-tight text-center">Movies</h1>
          <Link
            href="/"
            className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-white/70 hover:text-white hover:bg-white/10 active:scale-[0.97] transition"
            aria-label="Home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
            </svg>
          </Link>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-3">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={
                  a.variant === "primary"
                    ? "block h-14 w-full rounded-xl bg-white text-black text-lg font-semibold grid place-items-center shadow-lg active:scale-[0.99] transition"
                    : "block h-14 w-full rounded-xl border border-white/10 bg-white/5 text-white text-lg font-semibold grid place-items-center shadow-lg active:scale-[0.99] transition"
                }
              >
                {a.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-white/5">
          <div className="px-4 pt-4 pb-3 flex items-baseline justify-between">
            <div className="text-lg font-semibold">Movies on Deck</div>
            <div className="text-sm text-white/55">
              {loading ? "…" : `${rows.length} item${rows.length === 1 ? "" : "s"}`}
            </div>
          </div>

          <div className="px-1 sm:px-2 pb-2">
            <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
              {err ? (
                <div className="p-3 text-sm text-red-300">{err}</div>
              ) : loading ? (
                <div className="p-3 text-sm text-white/60">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="p-3 text-sm text-white/60">No prioritized movies yet.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {rows.map((m) => {
                    const dur = minutesToHhMm(m.length_minutes);
                    const pr = m.priority;
                    const prLabel = pr === 99 ? "OD" : pr === 0 ? "W" : pr ?? "";

                    const isOpen = expandedId === m.id;

                    return (
                      <div key={m.id} className="px-2">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId((cur) => (cur === m.id ? null : m.id))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setExpandedId((cur) => (cur === m.id ? null : m.id));
                            }
                          }}
                          className="px-1.5 py-1.5 sm:px-2 sm:py-2 rounded-lg hover:bg-white/5 transition"
                        >
                          <div className="flex items-center gap-2">
                            {/* Title */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2 min-w-0">
                                <div className="truncate text-[15px] sm:text-[16px] font-semibold">
                                  {m.title}
                                </div>
                                {m.year ? (
                                  <div className="text-[13px] sm:text-[14px] text-white/45 shrink-0">{m.year}</div>
                                ) : null}
                              </div>
                            </div>

                            {/* Compact right cluster */}
                            <div className="flex items-center gap-1 shrink-0">
                              <div className="w-[34px] sm:w-[40px] text-right text-[12px] sm:text-[13px] tabular-nums text-white/70">
                                {dur}
                              </div>

                              <button
                                type="button"
                                aria-label="Move up"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePriority(m.id, "up");
                                }}
                                className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg border border-white/10 bg-white/5 grid place-items-center text-[12px] sm:text-[13px] text-white/85 active:scale-[0.98] transition"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                aria-label="Move down"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePriority(m.id, "down");
                                }}
                                className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg border border-white/10 bg-white/5 grid place-items-center text-[12px] sm:text-[13px] text-white/85 active:scale-[0.98] transition"
                              >
                                ▼
                              </button>

                              <div className="w-[22px] sm:w-[28px] text-right text-[12px] sm:text-[13px] text-white/65 tabular-nums">
                                {prLabel === "W" ? (
                                  <span className="sm:hidden">W</span>
                                ) : prLabel === "OD" ? (
                                  <span>OD</span>
                                ) : (
                                  <span>{prLabel}</span>
                                )}
                              </div>

                              <button
                                type="button"
                                aria-label="Mark watched"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openWatchedModal(m.id);
                                }}
                                className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-white/90 active:scale-[0.98] transition"
                              >
                                ✓
                              </button>
                            </div>
                          </div>

                          {isOpen ? (
                            <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
                              <div className="grid gap-1 text-[13px] text-white/70">
                                <div className="flex gap-2">
                                  <div className="w-16 text-white/45">Cat</div>
                                  <div>{m.category === "documentary" ? "Documentary" : m.category === "movie" ? "Movie" : "—"}</div>
                                </div>
                                <div className="flex gap-2">
                                  <div className="w-16 text-white/45">Source</div>
                                  <div className="min-w-0 truncate">{m.source ?? "—"}</div>
                                </div>
                                <div className="flex gap-2">
                                  <div className="w-16 text-white/45">Where</div>
                                  <div className="min-w-0 truncate">{m.location ?? "—"}</div>
                                </div>
                                <div className="flex gap-2">
                                  <div className="w-16 text-white/45">Notes</div>
                                  <div className="min-w-0 whitespace-pre-wrap break-words">{m.note ?? "—"}</div>
                                </div>
                              </div>

                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(m.id);
                                  }}
                                  className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 text-white font-semibold active:scale-[0.99] transition"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteMovie(m.id);
                                  }}
                                  className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 text-red-200 font-semibold active:scale-[0.99] transition"
                                >
                                  Delete
                                </button>
                              </div>

                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Watched modal */}
      {watchingId ? (
        <div className="fixed inset-0 z-50 grid place-items-center px-5">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setWatchingId(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <div className="text-lg font-semibold mb-1">Mark watched</div>
            <div className="text-sm text-white/60 mb-4 truncate">
              {watchingRow ? watchingRow.title : ""}
            </div>

            <label className="block text-xs text-white/60 mb-1">Watched date</label>
            <input
              type="date"
              value={watchedDate}
              onChange={(e) => setWatchedDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
            />

            <label className="block text-xs text-white/60 mt-3 mb-1">Add to notes (optional)</label>
            <textarea
              value={watchedNote}
              onChange={(e) => setWatchedNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
              placeholder=""
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setWatchingId(null)}
                className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-white font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMarkWatched}
                className="h-11 flex-1 rounded-xl bg-white text-black font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit modal */}
      {editingId ? (
        <div className="fixed inset-0 z-50 grid place-items-center px-5">
          <div className="absolute inset-0 bg-black/70" onClick={() => setEditingId(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <div className="text-lg font-semibold mb-1">Edit</div>

            <label className="block text-xs text-white/60 mb-1">Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
            />

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-xs text-white/60 mb-1">Year</label>
                <input
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-white/60 mb-1">Length</label>
                <input
                  value={editLength}
                  onChange={(e) => setEditLength(e.target.value)}
                  placeholder="1:30"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-white/60 mb-1">Priority</label>
                <input
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  inputMode="numeric"
                  placeholder=""
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-xs text-white/60 mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                >
                  <option value="">—</option>
                  <option value="movie">Movie</option>
                  <option value="documentary">Documentary</option>
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-white/60 mb-1">Source</label>
                <input
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-white/60 mb-1">Where</label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                />
              </div>
            </div>

            <label className="block text-xs text-white/60 mt-3 mb-1">Notes</label>
            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-white font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdits}
                className="h-11 flex-1 rounded-xl bg-white text-black font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}