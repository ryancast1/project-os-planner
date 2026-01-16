"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  created_at: string | null;
  category: "movie" | "documentary" | null;
  title: string | null;
  year: number | null;
  length_minutes: number | null;
  priority: number | null;
  source: string | null;
  location: string | null;
  note: string | null;
  status: "to_watch" | "watching" | "watched" | null;
  date_watched: string | null;
};

function todayISODateLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function minutesToHMM(mins: number | null) {
  if (mins == null) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${mins}m`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function parseLengthToMinutes(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (!t.includes(":")) {
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }
  const [hs, ms] = t.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m >= 60)
    return null;
  const out = h * 60 + m;
  return out > 0 ? out : null;
}

function priorityLabel(p: Row["priority"]) {
  if (p == null) return "";
  if (p === 0) return "Watching";
  if (p === 99) return "On Deck";
  return String(p);
}

function priorityLabelCompact(p: Row["priority"]) {
  if (p == null) return "";
  if (p === 0) return "Watching";
  if (p === 99) return "OD";
  return String(p);
}

function catLong(c: Row["category"]) {
  if (c === "documentary") return "Documentary";
  if (c === "movie") return "Movie";
  return "—";
}

function sortWatchlistRows(list: Row[]): Row[] {
  return [...list].sort((a, b) => {
    const pa = a.priority;
    const pb = b.priority;
    const aNull = pa == null;
    const bNull = pb == null;

    // nulls last
    if (aNull !== bNull) return aNull ? 1 : -1;

    // both non-null: ascending
    if (!aNull && !bNull && pa !== pb) return (pa as number) - (pb as number);

    // newest first
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca > cb ? -1 : 1;

    // stable-ish by title
    const ta = (a.title ?? "").toLowerCase();
    const tb = (b.title ?? "").toLowerCase();
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
}

type EditDraft = {
  category: "movie" | "documentary";
  title: string;
  yearText: string;
  lengthText: string;
  priorityText: string;
  source: string;
  location: string;
  note: string;
};

function draftFromRow(r: Row): EditDraft {
  return {
    category: (r.category ?? "movie") as "movie" | "documentary",
    title: r.title ?? "",
    yearText: r.year == null ? "" : String(r.year),
    lengthText: r.length_minutes == null ? "" : minutesToHMM(r.length_minutes),
    priorityText: r.priority == null ? "" : String(r.priority),
    source: r.source ?? "",
    location: r.location ?? "",
    note: r.note ?? "",
  };
}

export default function WatchlistPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [watchedModalId, setWatchedModalId] = useState<string | null>(null);
  const [watchedDate, setWatchedDate] = useState<string>(todayISODateLocal());
  const [watchedNote, setWatchedNote] = useState<string>("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("movie_tracker")
        .select(
          "id, created_at, category, title, year, length_minutes, priority, source, location, note, status, date_watched"
        )
        .eq("status", "to_watch")
        .order("priority", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("title", { ascending: true });

      if (!alive) return;

      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        setRows(sortWatchlistRows((data as Row[]) || []));
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const count = useMemo(() => rows.length, [rows]);

  function toggleExpanded(id: string) {
    setExpandedId((cur) => {
      const next = cur === id ? null : id;
      if (next !== id) {
        setEditingId(null);
        setDraft(null);
      }
      return next;
    });
  }

  function startEdit(r: Row) {
    setExpandedId(r.id);
    setEditingId(r.id);
    setDraft(draftFromRow(r));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    setBusyId(id);
    setErr(null);

    const yearTrim = draft.yearText.trim();
    const yearVal = yearTrim === "" ? null : Number(yearTrim);
    const yearOk =
      yearVal == null ||
      (Number.isFinite(yearVal) && yearVal >= 1880 && yearVal <= 2100);

    const lenVal = parseLengthToMinutes(draft.lengthText);

    const prTrim = draft.priorityText.trim();
    const prVal = prTrim === "" ? null : Number(prTrim);
    const prOk = prVal == null || (Number.isFinite(prVal) && prVal >= 0);

    if (!yearOk) {
      setErr("Year must be blank or a valid year (e.g. 1999).");
      setBusyId(null);
      return;
    }
    if (!prOk) {
      setErr("Priority must be blank or a non-negative number.");
      setBusyId(null);
      return;
    }

    const patch: Partial<Row> = {
      category: draft.category,
      title: draft.title.trim() || null,
      year: yearVal == null ? null : Math.floor(yearVal),
      length_minutes: lenVal,
      priority: prVal == null ? null : Math.floor(prVal),
      source: draft.source.trim() || null,
      location: draft.location.trim() || null,
      note: draft.note.trim() || null,
    };

    const { data, error } = await supabase
      .from("movie_tracker")
      .update(patch)
      .eq("id", id)
      .select(
        "id, created_at, category, title, year, length_minutes, priority, source, location, note, status, date_watched"
      )
      .single();

    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }

    const updated = data as Row;

    setRows((cur) => sortWatchlistRows(cur.map((r) => (r.id === id ? updated : r))));
    setBusyId(null);
    setEditingId(null);
    setDraft(null);
  }

  async function deleteRow(id: string) {
    const ok = window.confirm("Delete this entry? This cannot be undone.");
    if (!ok) return;

    setBusyId(id);
    setErr(null);

    const { error } = await supabase.from("movie_tracker").delete().eq("id", id);

    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }

    setRows((cur) => cur.filter((r) => r.id !== id));
    setBusyId(null);
    setExpandedId((cur) => (cur === id ? null : cur));
    setEditingId(null);
    setDraft(null);
  }

  async function setOnDeck(id: string) {
    setBusyId(id);
    setErr(null);

    const { data, error } = await supabase
      .from("movie_tracker")
      .update({ priority: 99 })
      .eq("id", id)
      .select(
        "id, created_at, category, title, year, length_minutes, priority, source, location, note, status, date_watched"
      )
      .single();

    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }

    const updated = data as Row;
    setRows((cur) => sortWatchlistRows(cur.map((r) => (r.id === id ? updated : r))));
    setBusyId(null);
  }

  function openWatchedModal(id: string) {
    setWatchedModalId(id);
    setWatchedDate(todayISODateLocal());
    setWatchedNote("");
  }

  function closeWatchedModal() {
    setWatchedModalId(null);
    setWatchedNote("");
  }

  async function confirmWatched() {
    if (!watchedModalId) return;

    const row = rows.find((r) => r.id === watchedModalId);
    setBusyId(watchedModalId);
    setErr(null);

    const extra = watchedNote.trim();
    const mergedNote =
      extra === "" ? row?.note ?? null : row?.note ? `${row.note}\n${extra}` : extra;

    const { error } = await supabase
      .from("movie_tracker")
      .update({
        status: "watched",
        date_watched: watchedDate,
        note: mergedNote,
      })
      .eq("id", watchedModalId);

    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }

    setRows((cur) => cur.filter((r) => r.id !== watchedModalId));
    setBusyId(null);
    setExpandedId(null);
    setEditingId(null);
    setDraft(null);
    closeWatchedModal();
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-3 sm:px-5 py-7 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-5">
          <h1 className="text-3xl font-semibold tracking-tight text-center">Watchlist</h1>
          <div className="mt-2 flex items-center justify-center text-sm text-white/60">
            <span>{loading ? "Loading…" : `${count} items`}</span>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {err}
          </div>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-1 sm:p-2">
          {/* Desktop-ish column headers */}
          <div className="hidden md:grid grid-cols-[1fr_90px_90px_44px] items-center gap-3 px-2 py-2 text-xs text-white/50">
            <div>Title</div>
            <div className="text-right">Length</div>
            <div className="text-right">Status</div>
            <div />
          </div>

          <div className="divide-y divide-white/10">
            {loading ? (
              <div className="p-4 text-sm text-white/60">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-white/60">No items in To Watch.</div>
            ) : (
              rows.map((r) => {
                const expanded = expandedId === r.id;
                const isEditing = editingId === r.id;

                return (
                  <div key={r.id} className="px-2 py-2">
                    {/* Clickable header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpanded(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpanded(r.id);
                        }
                      }}
                      className="rounded-xl outline-none focus:ring-2 focus:ring-white/10"
                    >
                    <div className="grid grid-cols-[minmax(0,1fr)_48px_40px_36px] sm:grid-cols-[minmax(0,1fr)_64px_44px_40px] md:grid-cols-[minmax(0,1fr)_90px_90px_44px] items-center gap-1 sm:gap-2">
                        {/* Title + year */}
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <div className="truncate text-base font-semibold text-white">
                              {r.title ?? "(untitled)"}
                            </div>
                            {r.year != null && (
                              <div className="shrink-0 text-sm text-white/50">{r.year}</div>
                            )}
                          </div>
                        </div>

                        {/* Length */}
                        <div className="text-right">
                          <div className="text-[11px] sm:text-sm text-white/80 tabular-nums whitespace-nowrap">
                            {minutesToHMM(r.length_minutes)}
                          </div>
                        </div>

                        {/* Status / On Deck */}
                        <div className="flex justify-end">
                          {r.priority == null ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOnDeck(r.id);
                              }}
                              disabled={busyId === r.id || isEditing}
                              className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-white/80 hover:bg-black/40 disabled:opacity-60"
                              aria-label="Add to On Deck"
                              title="Add to On Deck"
                            >
                              +
                            </button>
                          ) : (
                            <div className="text-[11px] sm:text-xs md:text-sm text-white/60 tabular-nums whitespace-nowrap">
  <span className="inline md:hidden" title={priorityLabel(r.priority)}>
    {priorityLabelCompact(r.priority)}
  </span>
  <span className="hidden md:inline">{priorityLabel(r.priority)}</span>
</div>
                          )}
                        </div>

                        {/* Mark watched */}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openWatchedModal(r.id);
                            }}
                            disabled={busyId === r.id}
                            className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-white/80 hover:bg-black/40 disabled:opacity-60"
                            aria-label="Mark watched"
                            title="Mark watched"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4 sm:h-5 sm:w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded */}
                    {expanded && (
                      <div
                        className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isEditing ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="text-xs text-white/50">Category</div>
                                <div className="text-white/80">{catLong(r.category)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-white/50">Priority</div>
                                <div className="text-white/80">
                                  {priorityLabel(r.priority) || "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-white/50">Source</div>
                                <div className="text-white/80 whitespace-pre-wrap">
                                  {r.source || "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-white/50">Location</div>
                                <div className="text-white/80 whitespace-pre-wrap">
                                  {r.location || "—"}
                                </div>
                              </div>
                              <div className="md:col-span-2">
                                <div className="text-xs text-white/50">Notes</div>
                                <div className="text-white/80 whitespace-pre-wrap">
                                  {r.note || "—"}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(r)}
                                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 hover:bg-black/40"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRow(r.id)}
                                disabled={busyId === r.id}
                                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/15 disabled:opacity-60"
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        ) : (
                          draft && (
                            <div className="space-y-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <label className="text-xs text-white/50">Category</label>
                                  <select
                                    value={draft.category}
                                    onChange={(e) =>
                                      setDraft({
                                        ...draft,
                                        category: e.target.value as "movie" | "documentary",
                                      })
                                    }
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  >
                                    <option value="movie">Movie</option>
                                    <option value="documentary">Documentary</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="text-xs text-white/50">Priority</label>
                                  <input
                                    value={draft.priorityText}
                                    onChange={(e) =>
                                      setDraft({ ...draft, priorityText: e.target.value })
                                    }
                                    inputMode="numeric"
                                    placeholder="(blank)"
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  />
                                </div>

                                <div className="md:col-span-2">
                                  <label className="text-xs text-white/50">Title</label>
                                  <input
                                    value={draft.title}
                                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  />
                                </div>

                                <div>
                                  <label className="text-xs text-white/50">Year</label>
                                  <input
                                    value={draft.yearText}
                                    onChange={(e) => setDraft({ ...draft, yearText: e.target.value })}
                                    inputMode="numeric"
                                    placeholder="(optional)"
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  />
                                </div>

                                <div>
                                  <label className="text-xs text-white/50">Length</label>
                                  <input
                                    value={draft.lengthText}
                                    onChange={(e) =>
                                      setDraft({ ...draft, lengthText: e.target.value })
                                    }
                                    placeholder='90 or "1:30"'
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  />
                                </div>

                                <div>
                                  <label className="text-xs text-white/50">Source</label>
                                  <input
                                    value={draft.source}
                                    onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  />
                                </div>

                                <div>
                                  <label className="text-xs text-white/50">Location</label>
                                  <input
                                    value={draft.location}
                                    onChange={(e) =>
                                      setDraft({ ...draft, location: e.target.value })
                                    }
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  />
                                </div>

                                <div className="md:col-span-2">
                                  <label className="text-xs text-white/50">Notes</label>
                                  <textarea
                                    value={draft.note}
                                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                                    rows={4}
                                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-black/30"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEdit(r.id)}
                                  disabled={busyId === r.id}
                                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteRow(r.id)}
                                  disabled={busyId === r.id}
                                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/15 disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Mark watched modal */}
      {watchedModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/70" onClick={closeWatchedModal} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <div className="text-lg font-semibold">Mark as watched</div>
            <div className="mt-1 text-sm text-white/60">
              Set the watched date (defaults to today) and optionally add a note.
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-white/50">Watched date</label>
                <input
                  type="date"
                  value={watchedDate}
                  onChange={(e) => setWatchedDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                />
              </div>

              <div>
                <label className="text-xs text-white/50">Add to notes (optional)</label>
                <textarea
                  value={watchedNote}
                  onChange={(e) => setWatchedNote(e.target.value)}
                  rows={4}
                  placeholder="(optional)"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeWatchedModal}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-black/30"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmWatched}
                  disabled={busyId === watchedModalId}
                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                >
                  Mark watched
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}