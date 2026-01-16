"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

    // Go back to the home screen after save
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-center">Add a Movie</h1>
          <div className="mt-2 text-center text-sm text-white/60">
            <Link href="/" className="underline underline-offset-4 hover:text-white">
              Back
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-4">
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