"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getLastSession, saveSession } from "@/lib/db";
import RestTimer from "@/components/RestTimer";

type WorkoutLog = {
  date: string; // YYYY-MM-DD
  workout_name: string | null; // only for "other"
  weight: number | null;
  reps: Array<number | null>;
  compact: string;
  notes: string | null;
};

type WorkoutDraft = {
  otherName: string;
  weightText: string;
  repsText: string[];
  notes: string;
};

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

const TARGETS: Record<string, string> = {
  "bicep-curls": "8–15",
  "shoulder-press": "6–10",
  "chest-press": "8–12",
  "lat-pulldown": "8–12",
  "row": "8–12",
  "leg-press": "10–15",
  "leg-curl": "10–15",
  "lateral-raise": "12–20",
  "tricep-extension": "10–15",
"rear-delt-fly": "12–20",
"leg-extension": "12-20",
  // push-ups handled on its own page; other is freeform
};

function titleizeSlug(slug: string) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function WorkoutPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug;
  const slugStr =
    typeof slug === "string" ? slug : Array.isArray(slug) ? slug[0] : "";

  const isOther = slugStr === "other";
  const setCount = slugStr === "leg-press" ? 4 : 3;

  const storageKey = slugStr ? `workout_log_${slugStr}_v1` : "workout_log__v1";
  const draftKey = slugStr ? `workout_draft_${slugStr}_v1` : "workout_draft__v1";

  const emptyDraft: WorkoutDraft = useMemo(
    () => ({
      otherName: "",
      weightText: "",
      repsText: Array.from({ length: setCount }, () => ""),
      notes: "",
    }),
    [setCount]
  );

  const [draft, setDraft] = useState<WorkoutDraft>(emptyDraft);
const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [lastCompact, setLastCompact] = useState<string | null>(null);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [lastNotes, setLastNotes] = useState<string | null>(null);

  function isDraftEmpty(d: WorkoutDraft) {
    const allRepsEmpty = d.repsText.every((v) => v.trim() === "");
    const baseEmpty =
      d.weightText.trim() === "" && allRepsEmpty && d.notes.trim() === "";
    if (isOther) return d.otherName.trim() === "" || baseEmpty; // require name + something else
    return baseEmpty;
  }

  function persistDraft(next: WorkoutDraft) {
    if (!slugStr) return;
    // For non-other workouts: if all fields empty, remove draft
    // For other workout: remove draft if truly empty OR missing name
    const shouldRemove =
      (!isOther &&
        next.weightText.trim() === "" &&
        next.repsText.every((v) => v.trim() === "") &&
        next.notes.trim() === "") ||
      (isOther &&
        next.otherName.trim() === "" &&
        next.weightText.trim() === "" &&
        next.repsText.every((v) => v.trim() === "") &&
        next.notes.trim() === "");

    if (shouldRemove) {
      localStorage.removeItem(draftKey);
      return;
    }

    localStorage.setItem(draftKey, JSON.stringify(next));
  }

  useEffect(() => {
  if (!slugStr) return;

  let cancelled = false;
  setStatus("idle");

  (async () => {
    // 1) Load draft FIRST (sync)
    let nextDraft: WorkoutDraft = emptyDraft;

    const draftRaw = localStorage.getItem(draftKey);
    if (draftRaw) {
      try {
        const parsed = JSON.parse(draftRaw) as WorkoutDraft;
        nextDraft = {
          otherName: parsed.otherName ?? "",
          weightText: parsed.weightText ?? "",
          notes: parsed.notes ?? "",
          repsText: Array.from({ length: setCount }, (_, i) => parsed.repsText?.[i] ?? ""),
        };
      } catch {
        nextDraft = emptyDraft;
      }
    }

    if (cancelled) return;
    setDraft(nextDraft);

    // 2) Load last session SECOND (async)
    const last = await getLastSession(slugStr);
    if (cancelled) return;

    if (last) {
      setLastCompact(last.compact || null);
      setLastDate(last.performed_on || null);
      setLastNotes(last.notes || null);

      // 3) Prefill weight only if draft has none
      const lastWeight =
        (last as any)?.weight ??
        (last as any)?.payload?.weight ??
        null;

      if ((nextDraft.weightText ?? "").trim() === "" && lastWeight != null) {
        setDraft((prev) => ({ ...prev, weightText: String(Math.floor(Number(lastWeight))) }));
      }
    } else {
      setLastCompact(null);
      setLastDate(null);
      setLastNotes(null);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [slugStr, draftKey, setCount, emptyDraft]);

  const parsedOtherName = useMemo(() => draft.otherName.trim(), [draft.otherName]);

  const parsedWeight = useMemo(() => {
    const t = draft.weightText.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }, [draft.weightText]);

  const parsedReps = useMemo(() => {
    return draft.repsText.map((t) => {
      const trimmed = t.trim();
      if (trimmed === "") return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.floor(n);
    });
  }, [draft.repsText]);

  const repsPart = useMemo(() => {
    const repsFilled = parsedReps.filter((n): n is number => n !== null);
    return repsFilled.map(String).join("/");
  }, [parsedReps]);

  const compact = useMemo(() => {
    const weightPart = parsedWeight !== null ? String(parsedWeight) : "";

    if (isOther) {
      const namePart = parsedOtherName;
      if (!namePart) return "";

      if (weightPart && repsPart) return `${namePart} - ${weightPart} - ${repsPart}`;
      if (weightPart && !repsPart) return `${namePart} - ${weightPart}`;
      if (!weightPart && repsPart) return `${namePart} - ${repsPart}`;
      return `${namePart}`;
    }

    if (weightPart && repsPart) return `${weightPart} - ${repsPart}`;
    if (weightPart && !repsPart) return `${weightPart} -`;
    if (!weightPart && repsPart) return `- ${repsPart}`;
    return "";
  }, [isOther, parsedOtherName, parsedWeight, repsPart]);

  const canLog = useMemo(() => {
    const anyReps = parsedReps.some((n) => n !== null);
    const hasWeight = parsedWeight !== null;
    if (isOther) return parsedOtherName.length > 0 && (anyReps || hasWeight);
    return anyReps || hasWeight;
  }, [isOther, parsedOtherName, parsedReps, parsedWeight]);

  function updateDraft(next: WorkoutDraft) {
    persistDraft(next); // <-- write immediately (no race)
    setDraft(next);
    setStatus("idle");
  }

  function setDigitsOnly(value: string) {
    return value.replace(/[^\d]/g, "").slice(0, 3);
  }

  function onOtherNameChange(v: string) {
    updateDraft({ ...draft, otherName: v });
  }

  function onWeightChange(v: string) {
    updateDraft({ ...draft, weightText: setDigitsOnly(v) });
  }

  function onRepChange(idx: number, v: string) {
    const cleaned = setDigitsOnly(v);
    const nextReps = draft.repsText.map((x, i) => (i === idx ? cleaned : x));
    updateDraft({ ...draft, repsText: nextReps });
  }

  function onNotesChange(v: string) {
    updateDraft({ ...draft, notes: v });
  }

 async function logWorkout() {
    if (!slugStr || !canLog) return;

    const payload: WorkoutLog = {
      date: todayISODate(),
      workout_name: isOther ? parsedOtherName : null,
      weight: parsedWeight,
      reps: parsedReps,
      compact,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
    };

  try {
  setStatus("saving");

  await saveSession({
    workout_slug: slugStr,
    workout_name: isOther ? parsedOtherName : null,
    performed_on: payload.date,
    weight: parsedWeight,
    sets: parsedReps,
    compact,
    notes: payload.notes,
  });

  setLastCompact(payload.compact || null);
  setLastDate(payload.date);
  setLastNotes(payload.notes);
  setStatus("saved");

  localStorage.removeItem(draftKey);
  setDraft(emptyDraft);

  // After saving, go back to the workout tracker home
  router.push("/workout-tracker");
} catch (e: any) {
  console.error("SAVE FAILED:", e);
  setStatus("error");
  alert(`Save failed: ${e?.message ?? JSON.stringify(e)}`);
}
  }

  if (!slugStr) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-6 text-white">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold text-center">Workout</h1>
        </div>
      </main>
    );
  }

  const title = titleizeSlug(slugStr);

  const target = TARGETS[slugStr] ?? null;



  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-4">
          {isOther ? (
            <input
              value={draft.otherName}
              onChange={(e) => onOtherNameChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-2xl font-semibold tracking-tight outline-none focus:border-white/20 focus:bg-black/40"
            />
          ) : (
            <h1 className="text-3xl font-semibold tracking-tight text-center">
              {title}
            </h1>
          )}

          {!isOther && target && (
  <div className="mt-1 text-center text-sm text-white/60">
    {target} Reps

  </div>
)}

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

        <section className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-sm">
          <div className="mb-4 flex justify-center">
            <label className="block w-44">
              <span className="mb-1 block text-center text-xs text-white/60">
                Weight
              </span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft.weightText}
                onChange={(e) => onWeightChange(e.target.value)}
                className="h-14 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center text-xl font-semibold tracking-tight outline-none focus:border-white/20 focus:bg-black/40"
              />
            </label>
          </div>

          <div
            className={`grid gap-3 ${
              setCount === 4 ? "grid-cols-4" : "grid-cols-3"
            }`}
          >
            {draft.repsText.map((val, i) => (
              <label key={i} className="block">
                <span className="mb-1 block text-center text-xs text-white/60">
                  Set {i + 1}
                </span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={val}
                  onChange={(e) => onRepChange(i, e.target.value)}
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
                value={draft.notes}
                onChange={(e) => onNotesChange(e.target.value)}
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

      <RestTimer initialSeconds={90} />
      
        
      </div>
      
    </main>
  );
}
