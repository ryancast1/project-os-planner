import { supabase } from "@/lib/supabaseClient";
import type { SavedMarket } from "./types";

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
  return (data ?? []) as SavedMarket[];
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
