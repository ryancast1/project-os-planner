"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type MovieRow = {
  id: string;
  category: "movie" | "documentary";
  title: string;
  source: string | null;
  length_minutes: number | null;
  status: "to_watch" | "watched";
  date_watched: string | null; // YYYY-MM-DD
  priority: number | null;
  rewatch: boolean;
  location: string | null;
  year: number | null;
  note: string | null;
  created_at: string | null;
};

function minutesToHMM(mins: number | null): string | null {
  if (mins == null) return null;
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function ymdToMDY(ymd: string | null): string {
  if (!ymd) return "—";
  // ymd is YYYY-MM-DD
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  const yy = y.slice(-2);
  return `${Number(m)}/${Number(d)}/${yy}`;
}

function catBadge(c: MovieRow["category"]): string {
  return c === "documentary" ? "D" : "M";
}

function parseLengthToMinutes(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  // Accept h:mm or hh:mm
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || mm < 0 || mm >= 60) return null;
  const total = h * 60 + mm;
  return total > 0 ? total : null;
}

function minutesToInput(mins: number | null): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return String(m);
  return `${h}:${String(m).padStart(2, "0")}`;
}

type EditDraft = {
  category: MovieRow["category"];
  title: string;
  yearText: string;
  lengthText: string;
  status: MovieRow["status"];
  dateWatched: string; // YYYY-MM-DD or ""
  priorityText: string;
  rewatch: boolean;
  location: string;
  source: string;
  note: string;
};

export default function WatchedPage() {
  const [rows, setRows] = useState<MovieRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setStatus("loading");
        setErrMsg(null);

        const { data, error } = await supabase
          .from("movie_tracker")
          .select(
            "id,category,title,source,length_minutes,status,date_watched,priority,rewatch,location,year,note,created_at"
          )
          .eq("status", "watched")
          // Most recently watched first; if missing watched date, fall back to created_at
          .order("date_watched", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false, nullsFirst: false });

        if (error) throw error;

        if (!alive) return;
        setRows((data ?? []) as MovieRow[]);
        setStatus("ready");
      } catch (e: any) {
        if (!alive) return;
        setStatus("error");
        setErrMsg(e?.message ?? String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const yearStatsText = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();

    // Days elapsed since Jan 1, inclusive of Jan 1 and today
    const start = new Date(year, 0, 1);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysElapsed = Math.floor((now.getTime() - start.getTime()) / msPerDay) + 1;

    const watchedThisYear = rows.filter((r) => {
      if (!r.date_watched) return false;
      return r.date_watched.startsWith(String(year));
    }).length;

    const pace = daysElapsed > 0 ? (watchedThisYear * 365) / daysElapsed : 0;

    const total = rows.length;
    const moviesWord = total === 1 ? "Movie" : "Movies";

    const yWord = watchedThisYear === 1 ? "watched" : "watched";

    return `${total} ${moviesWord}  —  ${watchedThisYear} ${yWord} this year (${Math.round(pace)} pace)`;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => (r.title ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
  <div className="relative mx-auto max-w-5xl">
    <h1 className="text-center text-4xl sm:text-5xl font-semibold tracking-tight">
      Watched
    </h1>

    <div className="absolute right-0 top-1/2 -translate-y-1/2">
      <Link
        href="/movie-tracker/watched/calendar"
        className="inline-flex items-center rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white/80 hover:border-white/20 hover:bg-black/40"
      >
        Calendar
      </Link>
    </div>

    <div className="mt-2 text-center text-sm text-white/60">{yearStatsText}</div>
    <div className="mt-3 flex justify-center">
      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-xs h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-[16px] sm:text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
      />
    </div>
  </div>
</header>

        <section className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-[0_10px_60px_rgba(0,0,0,0.65)]">
          {status === "loading" && (
            <div className="py-10 text-center text-white/60">Loading…</div>
          )}

          {status === "error" && (
            <div className="py-10 text-center text-white/60">
              <div className="text-white/70">Failed to load watched list.</div>
              {errMsg && <div className="mt-2 text-xs text-white/50">{errMsg}</div>}
            </div>
          )}

          {status === "ready" && rows.length === 0 && (
            <div className="py-10 text-center text-white/60">No watched movies yet.</div>
          )}

          {status === "ready" && rows.length > 0 && (
            <div>
              <div className="hidden sm:grid sm:grid-cols-[1fr_130px] sm:items-center sm:gap-4 sm:px-3 sm:pb-3 text-sm text-white/40">
                <div>Title</div>
                <div className="text-right">Watched</div>
              </div>

              {filteredRows.length === 0 && search && (
                <div className="py-10 text-center text-white/60">No matches.</div>
              )}

              <div className="divide-y divide-white/10">
              {filteredRows.map((r) => {
                const isOpen = openId === r.id;
                const len = minutesToHMM(r.length_minutes);
                const watched = ymdToMDY(r.date_watched);

                return (
                  <div key={r.id} className="w-full">
                    {/* Summary row (tap to expand) */}
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId((prev) => {
                          const next = prev === r.id ? null : r.id;
                          // Close edit mode when collapsing or switching rows
                          if (next === null) {
                            setEditingId(null);
                            setEditDraft(null);
                          }
                          if (next && next !== prev) {
                            setEditingId(null);
                            setEditDraft(null);
                          }
                          return next;
                        });
                      }}
                      className="w-full text-left"
                    >
                      <div className="px-1 sm:px-3 py-3 sm:py-4">
                        <div className="grid grid-cols-[1fr_auto] items-start gap-3 sm:grid-cols-[1fr_130px] sm:items-center sm:gap-4">
                          {/* Title */}
                          <div className="min-w-0">
                            <div className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                              {r.title}
                              {typeof r.year === "number" && r.year > 0 && (
                                <span className="ml-2 text-white/50">({r.year})</span>
                              )}
                            </div>
                          </div>


                          {/* Watched date */}
                          <div className="text-right">
                            <div className="text-sm text-white/60 tabular-nums">{watched}</div>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Expanded panel */}
                    {isOpen && (
                      <div className="-mt-1 px-2 sm:px-4 pb-4">
                        <div className="mt-2 space-y-3 text-sm text-white/60">
                          {len && (
                            <div>
                              <span className="text-white/50">Length: </span>
                              <span className="text-white/70 tabular-nums">{len}</span>
                            </div>
                          )}
                          {/* Top row: category badge + actions */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-sm font-semibold text-white/80">
                              {catBadge(r.category)}
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              {editingId !== r.id ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingId(r.id);
                                    setEditDraft({
                                      category: r.category,
                                      title: r.title ?? "",
                                      yearText: r.year ? String(r.year) : "",
                                      lengthText: minutesToInput(r.length_minutes),
                                      status: r.status,
                                      dateWatched: r.date_watched ?? "",
                                      priorityText: r.priority == null ? "" : String(r.priority),
                                      rewatch: !!r.rewatch,
                                      location: r.location ?? "",
                                      source: r.source ?? "",
                                      note: r.note ?? "",
                                    });
                                  }}
                                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white/80"
                                >
                                  Edit
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingId(null);
                                      setEditDraft(null);
                                    }}
                                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white/70"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingId === r.id}
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!editDraft) return;

                                      const yearVal = editDraft.yearText.trim() ? Number(editDraft.yearText.trim()) : null;
                                      const year =
                                        yearVal == null || !Number.isFinite(yearVal) || yearVal <= 0
                                          ? null
                                          : Math.floor(yearVal);

                                      const length_minutes = parseLengthToMinutes(editDraft.lengthText);

                                      const pr = editDraft.priorityText.trim();
                                      const priorityVal = pr ? Number(pr) : null;
                                      const priority =
                                        priorityVal == null || !Number.isFinite(priorityVal)
                                          ? null
                                          : Math.floor(priorityVal);

                                      const payload: Partial<MovieRow> = {
                                        category: editDraft.category,
                                        title: editDraft.title.trim(),
                                        year,
                                        length_minutes,
                                        status: editDraft.status,
                                        date_watched: editDraft.dateWatched.trim() ? editDraft.dateWatched.trim() : null,
                                        priority,
                                        rewatch: !!editDraft.rewatch,
                                        location: editDraft.location.trim() ? editDraft.location.trim() : null,
                                        source: editDraft.source.trim() ? editDraft.source.trim() : null,
                                        note: editDraft.note.trim() ? editDraft.note.trim() : null,
                                      };

                                      try {
                                        setSavingId(r.id);
                                        const { error } = await supabase
                                          .from("movie_tracker")
                                          .update(payload)
                                          .eq("id", r.id);

                                        if (error) throw error;

                                        // Update local list
                                        setRows((prev) => {
                                          const next = prev.map((x) =>
                                            x.id === r.id ? ({ ...x, ...payload } as MovieRow) : x
                                          );
                                          // If user changed status away from watched, remove it from this list
                                          return payload.status && payload.status !== "watched"
                                            ? next.filter((x) => x.id !== r.id)
                                            : next;
                                        });

                                        setEditingId(null);
                                        setEditDraft(null);
                                      } catch (err: any) {
                                        alert(`Save failed: ${err?.message ?? String(err)}`);
                                      } finally {
                                        setSavingId(null);
                                      }
                                    }}
                                    className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-60"
                                  >
                                    {savingId === r.id ? "Saving…" : "Save"}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Either details or edit form */}
                          {editingId === r.id && editDraft ? (
                            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                  <span className="mb-1 block text-xs text-white/50">Category</span>
                                  <select
                                    value={editDraft.category}
                                    onChange={(e) =>
                                      setEditDraft((d) =>
                                        d ? { ...d, category: e.target.value as EditDraft["category"] } : d
                                      )
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                  >
                                    <option value="movie">Movie</option>
                                    <option value="documentary">Documentary</option>
                                  </select>
                                </label>

                                <label className="block">
                                  <span className="mb-1 block text-xs text-white/50">Status</span>
                                  <select
                                    value={editDraft.status}
                                    onChange={(e) =>
                                      setEditDraft((d) =>
                                        d ? { ...d, status: e.target.value as EditDraft["status"] } : d
                                      )
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                  >
                                    <option value="to_watch">To Watch</option>
                                    <option value="watched">Watched</option>
                                  </select>
                                </label>
                              </div>

                              <label className="block">
                                <span className="mb-1 block text-xs text-white/50">Title</span>
                                <input
                                  value={editDraft.title}
                                  onChange={(e) =>
                                    setEditDraft((d) => (d ? { ...d, title: e.target.value } : d))
                                  }
                                  className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                />
                              </label>

                              <div className="grid grid-cols-3 gap-3">
                                <label className="block">
                                  <span className="mb-1 block text-xs text-white/50">Year</span>
                                  <input
                                    inputMode="numeric"
                                    value={editDraft.yearText}
                                    onChange={(e) =>
                                      setEditDraft((d) => (d ? { ...d, yearText: e.target.value } : d))
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                  />
                                </label>

                                <label className="block">
                                  <span className="mb-1 block text-xs text-white/50">Length</span>
                                  <input
                                    placeholder="90 or 1:30"
                                    value={editDraft.lengthText}
                                    onChange={(e) =>
                                      setEditDraft((d) => (d ? { ...d, lengthText: e.target.value } : d))
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                  />
                                </label>

                                <label className="block">
                                  <span className="mb-1 block text-xs text-white/50">Priority</span>
                                  <input
                                    inputMode="numeric"
                                    value={editDraft.priorityText}
                                    onChange={(e) =>
                                      setEditDraft((d) => (d ? { ...d, priorityText: e.target.value } : d))
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                  />
                                </label>
                              </div>

                              <label className="block">
                                <span className="mb-1 block text-xs text-white/50">Date watched</span>
                                <input
                                  type="date"
                                  value={editDraft.dateWatched}
                                  onChange={(e) =>
                                    setEditDraft((d) => (d ? { ...d, dateWatched: e.target.value } : d))
                                  }
                                  className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                />
                              </label>

                              <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                  <span className="mb-1 block text-xs text-white/50">Location</span>
                                  <input
                                    value={editDraft.location}
                                    onChange={(e) =>
                                      setEditDraft((d) => (d ? { ...d, location: e.target.value } : d))
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                  />
                                </label>

                                <label className="block">
                                  <span className="mb-1 block text-xs text-white/50">Source</span>
                                  <input
                                    value={editDraft.source}
                                    onChange={(e) =>
                                      setEditDraft((d) => (d ? { ...d, source: e.target.value } : d))
                                    }
                                    className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-white outline-none"
                                  />
                                </label>
                              </div>

                              <label className="block">
                                <span className="mb-1 block text-xs text-white/50">Notes</span>
                                <textarea
                                  rows={3}
                                  value={editDraft.note}
                                  onChange={(e) =>
                                    setEditDraft((d) => (d ? { ...d, note: e.target.value } : d))
                                  }
                                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none"
                                />
                              </label>

                              <label className="inline-flex items-center gap-2 text-sm text-white/70">
                                <input
                                  type="checkbox"
                                  checked={editDraft.rewatch}
                                  onChange={(e) =>
                                    setEditDraft((d) => (d ? { ...d, rewatch: e.target.checked } : d))
                                  }
                                />
                                Rewatch
                              </label>
                            </div>
                          ) : (
                            <>
                              {r.source && (
                                <div>
                                  <span className="text-white/50">Source: </span>
                                  <span className="text-white/70">{r.source}</span>
                                </div>
                              )}
                              {r.location && (
                                <div>
                                  <span className="text-white/50">Location: </span>
                                  <span className="text-white/70">{r.location}</span>
                                </div>
                              )}
                              {r.note && (
                                <div className="whitespace-pre-wrap">
                                  <span className="text-white/50">Notes: </span>
                                  <span className="text-white/70">{r.note}</span>
                                </div>
                              )}
                              {!r.source && !r.location && !r.note && (
                                <div className="text-white/40">No Source / Location / Notes.</div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}