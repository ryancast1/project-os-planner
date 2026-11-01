import { supabase } from "@/lib/supabaseClient";
import type { SavedView, LayoutMode, PanelSlot } from "./types";
import { normalizeSavedView, storedLayout } from "./layouts";

export async function loadViews(userId: string): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from("situation_views")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load views:", error);
    return [];
  }
  return (data ?? []).map(normalizeSavedView).filter((view): view is SavedView => view !== null);
}

export async function createView(
  userId: string,
  title: string,
  layout: LayoutMode,
  panels: PanelSlot[]
): Promise<SavedView | null> {
  const { data, error } = await supabase
    .from("situation_views")
    .insert({ user_id: userId, title, layout: storedLayout(layout), panels })
    .select()
    .single();

  if (error) {
    console.error("Failed to create view:", error);
    return null;
  }
  return normalizeSavedView(data);
}

export async function updateView(
  id: string,
  title: string,
  layout: LayoutMode,
  panels: PanelSlot[]
): Promise<boolean> {
  const { error } = await supabase
    .from("situation_views")
    .update({ title, layout: storedLayout(layout), panels })
    .eq("id", id);

  if (error) {
    console.error("Failed to update view:", error);
    return false;
  }
  return true;
}

export async function deleteView(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("situation_views")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete view:", error);
    return false;
  }
  return true;
}
