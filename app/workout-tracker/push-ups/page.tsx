"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getLastSession, saveSession } from "@/lib/db";


type PushupLog = {
  date: string; // YYYY-MM-DD
  sets: Array<number | null>; // length 6
  sets_compact: string; // "10-10-10"
  notes: string | null;
};

type PushupDraft = {
  setsText: string[]; // length 6
  notes: string;
};

const STORAGE_KEY = "pushups_log_v1";
const DRAFT_KEY = "pushups_draft_v1";

function todayISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToMDY(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export default function PushUpsPage() {
  const [setsText, setSetsText] = useState<string[]>(["", "", "", "", "", ""]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  const [lastCompact, setLastCompact] = useState<string | null>(null);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [lastNotes, setLastNotes] = useState<string | null>(null);

  const router = useRouter();

  // Load last logged session + draft on first mount
  useEffect(() => {
    // last session (from DB)
(async () => {
  const last = await getLastSession("push-ups");
  if (last) {
    setLastCompact(last.compact || null);
    setLastDate(last.performed_on || null);
    setLastNotes(last.notes || null);
  } else {
    setLastCompact(null);
    setLastDate(null);
    setLastNotes(null);
  }
})();

    // draft
    const draftRaw = localStorage.getItem(DRAFT_KEY);
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw) as PushupDraft;
        const nextSets = Array.from({ length: 6 }, (_, i) => draft.setsText?.[i] ?? "");
        setSetsText(nextSets);
        setNotes(draft.notes ?? "");
      } catch {
        // ignore
      }
    }
  }, []);

  // Auto-save draft whenever inputs change
  useEffect(() => {
    const allEmpty = setsText.every((v) => v.trim() === "") && notes.trim() === "";
    if (allEmpty) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    const draft: PushupDraft = { setsText, notes };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [setsText, notes]);

  const parsedSets = useMemo(() => {
    return setsText.map((t) => {
      const trimmed = t.trim();
      if (trimmed === "") return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.floor(n);
    });
  }, [setsText]);

  const compactSets = useMemo(() => {
    const filled = parsedSets.filter((n): n is number => n !== null);
    return filled.map(String).join("/");
  }, [parsedSets]);

  const canLog = compactSets.length > 0;

  function setSetValue(idx: number, value: string) {
    const cleaned = value.replace(/[^\d]/g, "").slice(0, 3);
    setSetsText((prev) => prev.map((v, i) => (i === idx ? cleaned : v)));
    setStatus("idle");
  }

async function logWorkout() {
      if (!canLog) return;

    const payload: PushupLog = {
      date: todayISODate(),
      sets: parsedSets,
      sets_compact: compactSets,
      notes: notes.trim() ? notes.trim() : null,
    };

await saveSession({
  workout_slug: "push-ups",
  workout_name: null,
  performed_on: payload.date,
  weight: null,
  sets: payload.sets,          // already parsed numbers/nulls
  compact: payload.sets_compact,
  notes: payload.notes,
});

    setLastCompact(payload.sets_compact);
    setLastDate(payload.date);
    setLastNotes(payload.notes);

    // clear draft + clear inputs after logging
    localStorage.removeItem(DRAFT_KEY);
    setSetsText(["", "", "", "", "", ""]);
    setNotes("");

    setStatus("saved");

    // After saving, go back to the workout tracker home
    router.push("/workout-tracker");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-center">
            Push Ups
          </h1>

          {lastCompact && lastDate && (
            <div className="mt-2 text-center">
              <div className="text-sm text-white/70">
                <span className="text-white/60">Last Session: </span>
                <span className="font-semibold text-white">{lastCompact}</span>{" "}
                <span className="text-white/60">{isoToMDY(lastDate)}</span>
              </div>

              {lastNotes && (
                <div className="mt-1 text-sm text-white/60 whitespace-pre-wrap">
                  {lastNotes}
                </div>
              )}
            </div>
          )}
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            {setsText.map((val, i) => (
              <label key={i} className="block">
                <span className="mb-1 block text-center text-xs text-white/60">
                  Set {i + 1}
                </span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={val}
                  onChange={(e) => setSetValue(i, e.target.value)}
                  className="h-14 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center text-xl font-semibold tracking-tight outline-none focus:border-white/20 focus:bg-black/40"
                />
              </label>
            ))}
          </div>

          <div className="mt-5">
            <label className="block">
              <span className="mb-1 block text-center text-xs text-white/60">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setStatus("idle");
                }}
                rows={2}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base outline-none focus:border-white/20 focus:bg-black/40"
              />
            </label>
          </div>

          <button
            onClick={logWorkout}
            disabled={!canLog}
            className="mt-6 h-14 w-full rounded-xl bg-white text-lg font-semibold text-black active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-black/60"
          >
            Log Workout
          </button>

          <div className="mt-3 text-center text-xs text-white/50">
            {status === "saved" ? "Saved ✓" : " "}
          </div>
        </section>
      </div>
    </main>
  );
}