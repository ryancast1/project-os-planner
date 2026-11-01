import type { LayoutMode, SavedView } from "./types";

export function normalizeLayout(value: unknown): LayoutMode | null {
  if (value === "TV") return "7x4";
  switch (value) {
    case "1": case "2": case "2x2": case "3x2": case "4x2": case "7x4": return value;
    default: return null;
  }
}

export function storedLayout(layout: LayoutMode): LayoutMode | "TV" {
  // Retain the existing database value so old presets and schema constraints
  // remain compatible. In the app this is just another selectable grid size.
  return layout === "7x4" ? "TV" : layout;
}

export function normalizeSavedView(view: Omit<SavedView, "layout"> & { layout: unknown }): SavedView | null {
  const layout = normalizeLayout(view.layout);
  return layout ? { ...view, layout } : null;
}
