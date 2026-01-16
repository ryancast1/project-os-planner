import { supabase } from "@/lib/supabaseClient";

export type SessionRecord = {
  workout_slug: string; // 'push-ups', 'chest-press', etc.
  workout_name?: string | null; // only for "other"
  performed_on: string; // YYYY-MM-DD

  weight?: number | null;
  sets: Array<number | null>; // up to 6

  compact: string;
  notes?: string | null;
};

export async function getLastSession(workoutSlug: string) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("workout_slug", workoutSlug)
    .order("performed_on", { ascending: false })
    .order("submitted_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function saveSession(r: SessionRecord) {
  const s = [...r.sets, null, null, null, null, null, null].slice(0, 6);

  const row = {
    workout_slug: r.workout_slug,
    workout_name: r.workout_name ?? null,
    performed_on: r.performed_on,
    weight: r.weight ?? null,
    set1_reps: s[0],
    set2_reps: s[1],
    set3_reps: s[2],
    set4_reps: s[3],
    set5_reps: s[4],
    set6_reps: s[5],
    compact: r.compact,
    notes: r.notes ?? null,
  };

  const { error } = await supabase.from("workout_sessions").insert(row);
  if (error) {
  console.error("SUPABASE INSERT ERROR:", error);
  throw error;
}


}


export type WorkoutSessionRow = {
  id: string;
  workout_slug: string;
  workout_name: string | null;
  performed_on: string;
  weight: number | null;
  set1_reps: number | null;
  set2_reps: number | null;
  set3_reps: number | null;
  set4_reps: number | null;
  set5_reps: number | null;
  set6_reps: number | null;
  compact: string;
  notes: string | null;
  submitted_at: string;
};

export async function listRecentSessions(limit = 100): Promise<WorkoutSessionRow[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "id,workout_slug,workout_name,performed_on,weight,set1_reps,set2_reps,set3_reps,set4_reps,set5_reps,set6_reps,compact,notes,submitted_at"
    )
    .order("performed_on", { ascending: false })
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as WorkoutSessionRow[];
}

export async function updateSession(id: string, patch: Partial<Omit<WorkoutSessionRow, "id">>) {
  const { error } = await supabase.from("workout_sessions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSession(id: string) {
  const { error } = await supabase.from("workout_sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function listSessionsSince(startISO: string) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("performed_on,workout_slug")
    .gte("performed_on", startISO)
    .neq("workout_slug", "other")
    .order("performed_on", { ascending: false });

  if (error) throw error;
  return (data ?? []) as { performed_on: string; workout_slug: string }[];
}
// Fetch ALL sessions for the current user (paged)
export async function listAllSessions(batchSize: number = 1000): Promise<WorkoutSessionRow[]> {
  const out: WorkoutSessionRow[] = [];
  let from = 0;

  while (true) {
    // IMPORTANT: use the SAME table name + ordering as listRecentSessions
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("*")
.order("performed_on", { ascending: false })
.order("id", { ascending: false })
.range(from, from + batchSize - 1);

    if (error) throw error;

    const chunk = (data ?? []) as WorkoutSessionRow[];
    if (chunk.length === 0) break;

    out.push(...chunk);
    if (chunk.length < batchSize) break;

    from += batchSize;
  }

  return out;
}

export async function listWeightSeries(slug: string, startISO: string) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("performed_on,weight")
    .eq("workout_slug", slug)
    .gte("performed_on", startISO)
    .not("weight", "is", null)
    .order("performed_on", { ascending: true });

  if (error) throw error;

  return (data ?? []) as { performed_on: string; weight: number }[];
}

