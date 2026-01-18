"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Workout Planner (7-day forward toggle grid)
 * - Shows the same top-left matrix from Dashboard (same sizing/spacing)
 * - Adds today + next 7 days below with a subtle separator above today
 * - Click squares for today/future days to toggle planned workouts (green)
 * - Logged workouts (from sessions table) are shown and not clickable
 *
 * Assumes:
 *   - Logged sessions table contains: performed_on (YYYY-MM-DD), workout_slug (text)
 *   - Planned table: public.workout_plans(user_id, planned_on, workout_slug)
 */

const START_ISO = "2026-01-01";
const DASH_TZ = "America/New_York";

type WorkoutCol = { kind: "workout"; slug: string; label: string };
type MatrixCol = { kind: "date" } | { kind: "spacer" } | WorkoutCol;

// Must match the dashboard grid exactly
const MATRIX_COLS: MatrixCol[] = [
  { kind: "date" },

  { kind: "workout", slug: "push-ups", label: "PU" },
  { kind: "workout", slug: "bicep-curls", label: "BC" },
  { kind: "spacer" },

  { kind: "workout", slug: "shoulder-press", label: "SP" },
  { kind: "workout", slug: "chest-press", label: "CP" },
  { kind: "workout", slug: "lateral-raise", label: "LR" },
  { kind: "workout", slug: "tricep-extension", label: "TE" },
  { kind: "spacer" },

  { kind: "workout", slug: "lat-pulldown", label: "LP" },
  { kind: "workout", slug: "row", label: "RW" },
  { kind: "workout", slug: "rear-delt-fly", label: "RD" },
  { kind: "spacer" },

  { kind: "workout", slug: "leg-press", label: "LP" },
  { kind: "workout", slug: "leg-curl", label: "LC" },
  { kind: "workout", slug: "leg-extension", label: "LE" },
];


const WORKOUTS = MATRIX_COLS.filter((c): c is WorkoutCol => c.kind === "workout");

const TASK_PREFIX = "Gym - ";

// Title logic groups
const GROUP_DAY_A = ["shoulder-press", "chest-press", "lateral-raise", "tricep-extension"] as const;
const GROUP_DAY_B = ["lat-pulldown", "row", "rear-delt-fly"] as const;
const GROUP_LEG = ["leg-press", "leg-curl", "leg-extension"] as const;

const SHORT_LABEL: Record<string, string> = {
  "push-ups": "PU",
  "bicep-curls": "BC",
  "shoulder-press": "SP",
  "chest-press": "CP",
  "lateral-raise": "LR",
  "tricep-extension": "TE",
  "lat-pulldown": "LP",
  "row": "RW",
  "rear-delt-fly": "RD",
  // Note: UI uses LP for both; keeping LP here too unless you want a distinct code.
  "leg-press": "LP",
  "leg-curl": "LC",
  "leg-extension": "LE",
};

function hasAll(slugs: Set<string>, group: readonly string[]) {
  return group.every((g) => slugs.has(g));
}

function buildWorkoutTitle(slugs: Set<string>) {
  const remaining = new Set(slugs);
  const groups: string[] = [];

  if (hasAll(remaining, GROUP_DAY_A)) {
    groups.push("Push Day");
    GROUP_DAY_A.forEach((g) => remaining.delete(g));
  }
  if (hasAll(remaining, GROUP_DAY_B)) {
    groups.push("Pull Day");
    GROUP_DAY_B.forEach((g) => remaining.delete(g));
  }
  if (hasAll(remaining, GROUP_LEG)) {
    groups.push("Leg Day");
    GROUP_LEG.forEach((g) => remaining.delete(g));
  }

  // Remaining items in UI order
  const ordered = WORKOUTS.map((w) => w.slug).filter((s) => remaining.has(s));
  const remCodes = ordered.map((s) => SHORT_LABEL[s] ?? s);

  if (groups.length === 0 && remCodes.length === 0) return null;

  const groupPart = groups.join(" + ");
  const remPart = remCodes.join("/");

  if (groupPart && remPart) return `${TASK_PREFIX}${groupPart} + ${remPart}`;
  if (groupPart) return `${TASK_PREFIX}${groupPart}`;
  return `${TASK_PREFIX}${remPart}`;
}

function keyOf(iso: string, slug: string) {
  return `${iso}|${slug}`;
}


function isoFromUTCDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function utcDateFromISO(iso: string) {
  const [y, m, da] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, da ?? 1));
}

function isoTodayInTZ(tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function todayInTZDate(tz: string) {
  return utcDateFromISO(isoTodayInTZ(tz));
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function fmtMD(iso: string) {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${m}/${d}`;
}

function isMondayISO(iso: string) {
  return utcDateFromISO(iso).getUTCDay() === 1; // Mon
}

function dowLetterISO(iso: string) {
  const d = utcDateFromISO(iso).getUTCDay(); // 0=Sun
  return ["S", "M", "T", "W", "T", "F", "S"][d] ?? "";
}

type SessionPair = { performed_on: string; workout_slug: string };
type PlanRow = { user_id?: string; planned_on: string; workout_slug: string };

export default function WorkoutPlannerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<SessionPair[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth <= 430);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Matrix sizing (slightly narrower on iPhone so the DOW letters don't touch the right border)
  const DATE_COL = isPhone ? 36 : 42;
  const CELL = 23;
  const SPACER = isPhone ? 6 : 8;
  const DOW_COL = isPhone ? 20 : 18;
  const matrixCols = (
    MATRIX_COLS.map((c) =>
      c.kind === "date" ? `${DATE_COL}px` : c.kind === "spacer" ? `${SPACER}px` : `${CELL}px`
    ).join(" ") + ` ${DOW_COL}px`
  );

  const todayISO = isoTodayInTZ(DASH_TZ);

  const futureDays = useMemo(() => {
    const today = todayInTZDate(DASH_TZ);
    const out: string[] = [];
    // show today + next 7 days
    for (let i = 0; i <= 7; i++) out.push(isoFromUTCDate(addDaysUTC(today, i)));
    return out;
  }, []);

  const selectableDays = useMemo(() => new Set(futureDays), [futureDays]);

  const historyDays = useMemo(() => {
    const end = todayInTZDate(DASH_TZ);
    const start = utcDateFromISO(START_ISO);
    const out: string[] = [];
    for (let d = end; d.getTime() >= start.getTime(); d = addDaysUTC(d, -1)) out.push(isoFromUTCDate(d));
    return out;
  }, []);

  const displayDays = useMemo(() => {
    const futureTopDown = [...futureDays].reverse(); // +7 ... today
    const past = historyDays.filter((d) => d !== todayISO); // yesterday ... start
    return [...futureTopDown, ...past];
  }, [futureDays, historyDays, todayISO]);

  const doneSet = useMemo(() => {
    const s = new Set<string>(); // "YYYY-MM-DD|slug"
    for (const p of pairs) s.add(`${p.performed_on}|${p.workout_slug}`);
    return s;
  }, [pairs]);

  const planSet = useMemo(() => {
    const s = new Set<string>(); // "YYYY-MM-DD|slug"
    for (const r of plans) s.add(`${r.planned_on}|${r.workout_slug}`);
    return s;
  }, [plans]);

  const savedSelectablePlanSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of plans) {
      if (!selectableDays.has(r.planned_on)) continue;
      s.add(keyOf(r.planned_on, r.workout_slug));
    }
    return s;
  }, [plans, selectableDays]);

  const isDirty = useMemo(() => {
    if (draftKeys.size !== savedSelectablePlanSet.size) return true;
    for (const k of draftKeys) if (!savedSelectablePlanSet.has(k)) return true;
    return false;
  }, [draftKeys, savedSelectablePlanSet]);

  async function loadSessions() {
    // Try a few common table names to avoid breaking if your schema differs.
    // Prefer: workout_sessions (performed_on, workout_slug)
    const candidates = ["workout_sessions", "sessions", "workout_log"];

    for (const table of candidates) {
      const { data, error } = await supabase
        .from(table)
        .select("performed_on,workout_slug")
        .gte("performed_on", START_ISO);

      if (!error && data) return data as SessionPair[];
    }

    throw new Error(
      `Couldn't load sessions. Expected a table with performed_on + workout_slug (tried: ${candidates.join(", ")}).`
    );
  }

  async function loadPlans() {
    const start = todayISO; // only need today+forward, but keeping it simple

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw new Error(userErr.message);
    const userId = userData.user?.id;
    if (!userId) throw new Error("Not signed in");

    const { data, error } = await supabase
      .from("workout_plans")
      .select("planned_on,workout_slug")
      .eq("user_id", userId)
      .gte("planned_on", start);

    if (error) throw new Error(error.message);
    return (data ?? []) as PlanRow[];
  }

  async function reloadAll() {
    setErr(null);
    setLoading(true);
    try {
      const [sess, pls] = await Promise.all([loadSessions(), loadPlans()]);
      setPairs(sess);
      setPlans(pls);
      // Initialize draft from saved plans for today..+7
      const freshSaved = new Set<string>();
      for (const r of pls) {
        if (!selectableDays.has(r.planned_on)) continue;
        freshSaved.add(keyOf(r.planned_on, r.workout_slug));
      }
      setDraftKeys(new Set(freshSaved));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadAll();

    // realtime: plans + sessions (best effort)
    const chan = supabase
      .channel("workout_planner_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_plans" },
        () =>
          void loadPlans()
            .then((p) => {
              setPlans(p);
              // If user hasn't started editing, keep draft in sync with saved plans
              setDraftKeys((cur) => {
                // If the user has unsaved edits, don't clobber the draft.
                const saved = new Set<string>();
                for (const r of p) {
                  if (!selectableDays.has(r.planned_on)) continue;
                  saved.add(keyOf(r.planned_on, r.workout_slug));
                }

                // If draft matches saved, keep synced; otherwise leave user's in-progress edits alone.
                if (cur.size !== saved.size) return cur;
                for (const k of cur) if (!saved.has(k)) return cur;
                return new Set(saved);
              });
            })
            .catch(() => {})
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_sessions" },
        () => void loadSessions().then(setPairs).catch(() => {})
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function toggleDraft(iso: string, slug: string) {
    const k = keyOf(iso, slug);

    // If actually logged, do nothing
    if (doneSet.has(k)) return;

    // Only selectable window is clickable
    if (!selectableDays.has(iso)) return;

    setDraftKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const getUserId = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? "605f4c7b-4d2d-4f7d-b215-1461cf1a5779";
  }, []);

  const saveAll = useCallback(async () => {
    setErr(null);
    setSavingAll(true);

    try {
      // 1) Sync workout_plans for selectable days
      const userId = await getUserId();
      const desired = new Set<string>(draftKeys);
      const existing = new Set<string>();
      for (const r of plans) {
        if (!selectableDays.has(r.planned_on)) continue;
        existing.add(keyOf(r.planned_on, r.workout_slug));
      }

      const toInsert: { user_id: string; planned_on: string; workout_slug: string }[] = [];
      const toDelete: { planned_on: string; workout_slug: string }[] = [];

      for (const k of desired) {
        if (!existing.has(k)) {
          const [planned_on, workout_slug] = k.split("|");
          if (planned_on && workout_slug) toInsert.push({ user_id: userId, planned_on, workout_slug });
        }
      }
      for (const k of existing) {
        if (!desired.has(k)) {
          const [planned_on, workout_slug] = k.split("|");
          if (planned_on && workout_slug) toDelete.push({ planned_on, workout_slug });
        }
      }

      if (toInsert.length) {
        const { error } = await supabase.from("workout_plans").insert(toInsert);
        if (error) throw new Error(error.message);
      }

      // Deletes must be per-row to avoid cross-product .in() issues
      for (const row of toDelete) {
        const { error } = await supabase
          .from("workout_plans")
          .delete()
          .eq("user_id", userId)
          .eq("planned_on", row.planned_on)
          .eq("workout_slug", row.workout_slug);
        if (error) throw new Error(error.message);
      }

      // Refresh plans after sync
      const freshPlans = await loadPlans();
      setPlans(freshPlans);

      // 2) Create/update/delete one task per day (today..+7)
      // const userId = await getUserId(); // removed; now declared above

      // Build per-day slug sets
      const perDay = new Map<string, Set<string>>();
      for (const d of selectableDays) perDay.set(d, new Set());
      for (const k of desired) {
        const [d, slug] = k.split("|");
        if (!d || !slug) continue;
        if (!selectableDays.has(d)) continue;
        perDay.get(d)?.add(slug);
      }

      // Fetch existing workout tasks for these days
      const dayList = Array.from(selectableDays);
      const { data: existingTasks, error: taskLoadErr } = await supabase
        .from("tasks")
        .select("id,title,status,scheduled_for")
        .in("scheduled_for", dayList)
        .ilike("title", `${TASK_PREFIX}%`);

      if (taskLoadErr) throw new Error(taskLoadErr.message);

      const byDay = new Map<string, any>();
      for (const t of existingTasks ?? []) {
        if (t?.scheduled_for && !byDay.has(t.scheduled_for)) byDay.set(t.scheduled_for, t);
      }

      for (const day of dayList) {
        const slugs = perDay.get(day) ?? new Set<string>();
        const title = buildWorkoutTitle(slugs);
        const existingTask = byDay.get(day);

        if (!title) {
          if (existingTask?.id) {
            const { error } = await supabase.from("tasks").delete().eq("id", existingTask.id);
            if (error) throw new Error(error.message);
          }
          continue;
        }

        if (existingTask?.id) {
          const { error } = await supabase
            .from("tasks")
            .update({ title })
            .eq("id", existingTask.id);
          if (error) throw new Error(error.message);
        } else {
          // Insert new
          const payload: any = {
            title,
            status: "open",
            scheduled_for: day,
          };
          // Include user_id if your schema requires it.
          payload.user_id = userId;

          const { error } = await supabase.from("tasks").insert(payload);
          if (error) throw new Error(error.message);
        }
      }

      // Re-sync draftKeys to saved
      const freshSaved = new Set<string>();
      for (const r of freshPlans) {
        if (!selectableDays.has(r.planned_on)) continue;
        freshSaved.add(keyOf(r.planned_on, r.workout_slug));
      }
      setDraftKeys(new Set(freshSaved));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSavingAll(false);
    }
  }, [draftKeys, plans, selectableDays, getUserId]);

  const MatrixGrid = (days: string[]) => (
    <div className="mt-1">
      {days.map((iso, idx) => {
        const isMonday = isMondayISO(iso);
        return (
          <div key={iso}>
            <div className="grid gap-0" style={{ gridTemplateColumns: matrixCols }}>
              {MATRIX_COLS.map((c, i) => {
                if (c.kind === "date") {
                  const isToday = iso === todayISO;
                  return (
                    <div
                      key={`d-${iso}`}
                      className={[
                        "relative h-[22px] px-1 flex items-center justify-center text-[11px]",
                        isToday ? "text-white font-semibold" : "text-white/70",
                      ].join(" ")}
                    >
                      {fmtMD(iso)}
                      {isToday ? (
                        <span className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                      ) : null}
                    </div>
                  );
                }

                if (c.kind === "spacer") return <div key={`sp-${iso}-${i}`} className="h-[22px]" />;

                const k = `${iso}|${c.slug}`;
                const logged = doneSet.has(k);
                const planned = selectableDays.has(iso) ? draftKeys.has(k) : planSet.has(k);
                const isSaving = false;

                const cls = logged
                  ? "bg-emerald-500/80 border-emerald-400/60"
                  : planned
                  ? "bg-emerald-700/70 border-emerald-600/60"
                  : "bg-white/5 border-white/10";

                const clickable = !logged && selectableDays.has(iso);

                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => clickable && toggleDraft(iso, c.slug)}
                    disabled={!clickable || isSaving}
                    className={[
                      "h-[22px] border rounded-sm",
                      cls,
                      clickable
                        ? planned
                          ? "cursor-pointer hover:bg-emerald-700/55"
                          : "cursor-pointer hover:bg-emerald-500/35"
                        : "cursor-default",
                      isSaving ? "opacity-60" : "",
                    ].join(" ")}
                    title={
                      logged
                        ? "Logged"
                        : planned
                        ? "Planned (tap to unplan)"
                        : "Tap to plan"
                    }
                  />
                );
              })}
              <div
                className={[
                  "h-[22px] flex items-center justify-center pl-[2px] text-[11px]",
                  iso === todayISO ? "text-white font-semibold" : "text-white/35",
                ].join(" ")}
              >
                {dowLetterISO(iso)}
              </div>
            </div>
            {isMonday ? <div className="h-3" /> : null}
          </div>
        );
      })}
      {/* Extra scroll runway so picks can keep filling without immediate scroll */}
      <div className="h-24" />
    </div>
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-2 sm:px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md md:max-w-4xl">
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="absolute left-0 rounded-lg px-3 py-1.5 text-sm font-semibold bg-white/10 text-white hover:bg-white/15"
          >
            Home
          </button>
          <h1 className="text-3xl font-semibold tracking-tight text-center">Workout Planner</h1>
          <div className="absolute right-0 flex items-center gap-2">
            {isDirty ? <span className="text-[11px] text-white/50 hidden sm:inline">Unsaved</span> : null}
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={!isDirty || savingAll || loading}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-semibold",
                !isDirty || savingAll || loading
                  ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : "bg-white text-black hover:bg-white/90",
              ].join(" ")}
            >
              {savingAll ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        <section className="mt-6 w-full md:w-fit mx-auto overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 sm:p-3">
          {/* Header row */}
          <div className="grid gap-0" style={{ gridTemplateColumns: matrixCols }}>
            {MATRIX_COLS.map((c, i) => {
              if (c.kind === "date") {
                return (
                  <div
                    key="date"
                    className="h-[22px] px-1 flex items-center justify-center text-[11px] text-white/70"
                  >
                    Date
                  </div>
                );
              }
              if (c.kind === "spacer") return <div key={`sp-h-${i}`} className="py-2" />;
              return (
                <div
                  key={c.slug}
                  className="py-2 text-[11px] text-white/70 text-center"
                  title={c.slug}
                >
                  {c.label}
                </div>
              );
            })}
            <div className="h-[22px] pl-[2px]" />
          </div>

          {loading ? (
            <div className="mt-4 text-center text-white/60 text-sm py-8">Loading…</div>
          ) : (
            <>
              {MatrixGrid(displayDays)}
            </>
          )}
        </section>
      </div>
    </main>
  );
}