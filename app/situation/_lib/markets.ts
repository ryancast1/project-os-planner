import { supabase } from "@/lib/supabaseClient";
import type { OutcomeColors, SavedMarket } from "./types";
import { clearLocalOutcomeColors, loadLocalOutcomeColors, sanitizeOutcomeColors, saveLocalOutcomeColors } from "./colors";

export async function getUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function loadSavedMarkets(
  userId: string
): Promise<SavedMarket[]> {
  const { data, error } = await supabase
    .from("situation_markets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load saved markets:", error);
    return [];
  }
  return ((data ?? []) as SavedMarket[]).map((market) => ({
    ...market,
    outcome_colors: loadLocalOutcomeColors(userId, market.id) ?? sanitizeOutcomeColors(market.outcome_colors),
  }));
}

export async function saveMarketOutcomeColors(
  userId: string,
  marketId: string,
  colors: OutcomeColors,
): Promise<"synced" | "local" | null> {
  const sanitized = sanitizeOutcomeColors(colors);
  // Keep settings usable before the optional database migration is installed,
  // or when the network is unavailable. A pending empty map also means reset.
  const savedLocally = saveLocalOutcomeColors(userId, marketId, sanitized);
  try {
    const { data, error } = await supabase
      .from("situation_markets")
      .update({ outcome_colors: sanitized })
      .eq("id", marketId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (!error && data) {
      clearLocalOutcomeColors(userId, marketId);
      return "synced";
    }
  } catch {
    // The editor reports when a save is available only in this browser.
  }
  return savedLocally ? "local" : null;
}

export async function saveMarketLabel(userId: string, marketId: string, label: string): Promise<boolean> {
  const trimmed = label.trim();
  if (!trimmed) return false;
  try {
    const { data, error } = await supabase
      .from("situation_markets")
      .update({ label: trimmed })
      .eq("id", marketId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

export async function addSavedMarket(
  userId: string,
  label: string,
  slug: string,
  source: string = "polymarket"
): Promise<SavedMarket | null> {
  const { data, error } = await supabase
    .from("situation_markets")
    .insert({ user_id: userId, label, slug, source })
    .select()
    .single();

  if (error) {
    console.error("Failed to add market:", error);
    return null;
  }
  return data as SavedMarket;
}

export async function removeSavedMarket(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("situation_markets")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to remove market:", error);
    return false;
  }
  return true;
}
