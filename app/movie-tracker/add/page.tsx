"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { searchMovies, getMovieDetails, getPosterUrl, type TMDBSearchResult } from "@/lib/tmdb";

type Category = "movie" | "documentary";
type Status = "to_watch" | "watching" | "watched";

function parseLengthToMinutes(input: string): number | null {
  const t = input.trim();
  if (!t) return null;

  // Accept: "90" (minutes) or "1:30" (h:mm) or "01:30"
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }

  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0) return null;
  return hh * 60 + mm;
}

export default function AddMoviePage() {
  const router = useRouter();
  const [category, setCategory] = useState<Category>("movie");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>("to_watch");

  const [source, setSource] = useState("");
  const [lengthText, setLengthText] = useState(""); // optional, placeholder only
  const [priorityText, setPriorityText] = useState(""); // optional now
  const [rewatch, setRewatch] = useState(false);
  const [location, setLocation] = useState("");
  const [yearText, setYearText] = useState(""); // optional
  const [dateWatched, setDateWatched] = useState(""); // required only if watched
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // TMDB search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const lengthMinutes = useMemo(() => parseLengthToMinutes(lengthText), [lengthText]);

  const parsedYear = useMemo(() => {
    const t = yearText.trim();
    if (!t) return null;
    const y = Number(t);
    if (!Number.isFinite(y) || y < 1880 || y > 2100) return null;
    return Math.floor(y);
  }, [yearText]);

  const parsedPriority = useMemo(() => {
    const t = priorityText.trim();
    if (!t) return null;
    const p = Number(t);
    if (!Number.isFinite(p) || p < 0 || p > 9999) return null;
    return Math.floor(p);
  }, [priorityText]);

  const canSave = useMemo(() => {
    if (!title.trim()) return false;

    // length optional, but if provided must parse
    if (lengthText.trim() && lengthMinutes == null) return false;

    // year optional, but if provided must parse
    if (yearText.trim() && parsedYear == null) return false;

    // priority optional, but if provided must parse
    if (priorityText.trim() && parsedPriority == null) return false;

    // watched requires date_watched
    if (status === "watched" && dateWatched.trim() === "") return false;

    return true;
  }, [title, lengthText, lengthMinutes, yearText, parsedYear, priorityText, parsedPriority, status, dateWatched]);

  // Debounced TMDB search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const results = await searchMovies(searchQuery);
      setSearchResults(results);
      setShowResults(true);
      setSearching(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Select a movie from TMDB results
  const selectMovie = useCallback(async (result: TMDBSearchResult) => {
    setShowResults(false);
    setSearchQuery("");

    // Get detailed movie info
    const details = await getMovieDetails(result.id);
    if (!details) {
      setTitle(result.title);
      if (result.release_date) {
        setYearText(result.release_date.split("-")[0]);
      }
      return;
    }

    // Populate form fields
    setTitle(details.title);

    if (details.release_date) {
      setYearText(details.release_date.split("-")[0]);
    }

    if (details.runtime) {
      const hours = Math.floor(details.runtime / 60);
      const mins = details.runtime % 60;
      setLengthText(`${hours}:${String(mins).padStart(2, "0")}`);
    }

    // Set category based on genre
    const isDocumentary = details.genres.some(g => g.name.toLowerCase() === "documentary");
    setCategory(isDocumentary ? "documentary" : "movie");

    // Add overview to notes if present
    if (details.overview) {
      setNote(details.overview);
    }
  }, []);

  async function onSave() {
    if (!canSave || saving) return;

    setSaving(true);
    setMsg(null);

    const payload: any = {
      category,
      title: title.trim(),
      status,

      source: source.trim() ? source.trim() : null,
      length_minutes: lengthMinutes, // null if blank
      year: parsedYear, // null if blank
      location: location.trim() ? location.trim() : null,
      note: note.trim() ? note.trim() : null,
      rewatch,

      // only for watched
      date_watched: status === "watched" ? (dateWatched || null) : null,

      // IMPORTANT: send null when blank so DB default 99 doesn't kick in (if column allows null)
      priority: parsedPriority,
    };

    const { error } = await supabase.from("movie_tracker").insert(payload);
    if (error) {
      setMsg(`Save failed: ${error.message}`);
      setSaving(false);
      return;
    }

    setMsg("Saved ✓");
    setSaving(false);

    // Go back to the movie tracker page after save
    router.push("/movie-tracker");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-center">Add a Movie</h1>
          <div className="mt-2 text-center text-sm text-white/60">
            <Link href="/movie-tracker" className="underline underline-offset-4 hover:text-white">
              Back
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-4">
            {/* TMDB Search */}
            <div className="relative">
              <label className="block">
                <span className="mb-1 block text-xs text-white/60 text-center">Search TMDB</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a movie..."
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-lg outline-none focus:border-white/20 focus:bg-black/40"
                />
              </label>

              {searching && (
                <div className="mt-2 text-center text-sm text-white/60">Searching...</div>
              )}

              {showResults && searchResults.length > 0 && (
                <div className="absolute z-10 mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 shadow-2xl max-h-96 overflow-y-auto">
                  {searchResults.map((result) => {
                    const year = result.release_date ? result.release_date.split("-")[0] : "";
                    const posterUrl = getPosterUrl(result.poster_path, "w92");

                    return (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => selectMovie(result)}
                        className="w-full flex items-start gap-3 p-3 hover:bg-white/5 transition border-b border-white/5 last:border-b-0 text-left"
                      >
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={result.title}
                            className="w-12 h-18 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-18 bg-white/5 rounded flex items-center justify-center text-white/30 text-xs">
                            No poster
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white truncate">{result.title}</div>
                          {year && <div className="text-sm text-white/60">{year}</div>}
                          {result.overview && (
                            <div className="text-xs text-white/45 line-clamp-2 mt-1">
                              {result.overview}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {showResults && searchResults.length === 0 && !searching && (
                <div className="mt-2 text-center text-sm text-white/60">No results found</div>
              )}
            </div>

            <div className="border-t border-white/10 pt-4">
              <div className="text-xs text-white/40 text-center mb-4">Or enter manually</div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-white/60 text-center">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-lg outline-none focus:border-white/20 focus:bg-black/40"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-white/60 text-center">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 outline-none focus:border-white/20"
                >
                  <option value="movie">Movie</option>
                  <option value="documentary">Documentary</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-white/60 text-center">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 outline-none focus:border-white/20"
                >
                  <option value="to_watch">To watch</option>
                  <option value="watched">Watched</option>
                </select>
              </label>
            </div>

            {status === "watched" && (
              <label className="block">
                <span className="mb-1 block text-xs text-white/60 text-center">Date watched</span>
                <input
                  type="date"
                  value={dateWatched}
                  onChange={(e) => setDateWatched(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-white/60 text-center">Length (optional)</span>
                <input
                  value={lengthText}
                  onChange={(e) => setLengthText(e.target.value)}
                  placeholder='90 or 1:30'
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-white/60 text-center">Year (optional)</span>
                <input
                  value={yearText}
                  onChange={(e) => setYearText(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-white/60 text-center">Priority (optional)</span>
                <input
                  value={priorityText}
                  onChange={(e) => setPriorityText(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
                />
              </label>

              <label className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <input
                  type="checkbox"
                  checked={rewatch}
                  onChange={(e) => setRewatch(e.target.checked)}
                  className="h-5 w-5"
                />
                <span className="text-sm text-white/80">Rewatch</span>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-white/60 text-center">Source</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-white/60 text-center">Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-white/60 text-center">Note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-white/20"
              />
            </label>

            <button
              onClick={onSave}
              disabled={!canSave || saving}
              className="mt-2 block h-14 w-full rounded-xl bg-white text-black text-lg font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <div className="h-5 text-center text-sm text-white/60">{msg ?? ""}</div>
          </div>
        </section>
      </div>
    </main>
  );
}