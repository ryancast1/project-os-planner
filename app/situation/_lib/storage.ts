import type { LayoutMode, TimeRangeLabel, PanelSlot } from "./types";
import { TIME_RANGES, LAYOUT_CONFIGS } from "./constants";

const STORAGE_KEYS = {
  layout: "situation-layout",
  panels: "situation-panels",
  timeRange: "situation-timerange",
  activeViewId: "situation-active-view",
} as const;

export type LocalState = {
  layout: LayoutMode;
  panels: PanelSlot[];
  timeRange: TimeRangeLabel;
};

const VALID_LAYOUTS: LayoutMode[] = ["1", "2", "2x2", "3x2", "4x2"];

export function loadLocalState(): LocalState {
  if (typeof window === "undefined") {
    return { layout: "1", panels: [null], timeRange: "1D" };
  }

  // Layout
  const rawLayout = localStorage.getItem(STORAGE_KEYS.layout);
  const layout: LayoutMode =
    rawLayout && VALID_LAYOUTS.includes(rawLayout as LayoutMode)
      ? (rawLayout as LayoutMode)
      : "1";

  // Panels
  let panels: PanelSlot[];
  try {
    const rawPanels = localStorage.getItem(STORAGE_KEYS.panels);
    panels = rawPanels ? JSON.parse(rawPanels) : [];
  } catch {
    panels = [];
  }
  // Ensure correct length for layout
  const expected = LAYOUT_CONFIGS[layout].panelCount;
  while (panels.length < expected) panels.push(null);
  if (panels.length > expected) panels = panels.slice(0, expected);

  // Time range
  const rawTR = localStorage.getItem(STORAGE_KEYS.timeRange);
  const timeRange: TimeRangeLabel =
    rawTR && TIME_RANGES.some((r) => r.label === rawTR)
      ? (rawTR as TimeRangeLabel)
      : "1D";

  return { layout, panels, timeRange };
}

export function saveLayout(layout: LayoutMode) {
  localStorage.setItem(STORAGE_KEYS.layout, layout);
}

export function savePanels(panels: PanelSlot[]) {
  localStorage.setItem(STORAGE_KEYS.panels, JSON.stringify(panels));
}

export function saveTimeRange(timeRange: TimeRangeLabel) {
  localStorage.setItem(STORAGE_KEYS.timeRange, timeRange);
}

export function loadActiveViewId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.activeViewId) ?? null;
}

export function saveActiveViewId(id: string | null) {
  if (id) {
    localStorage.setItem(STORAGE_KEYS.activeViewId, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.activeViewId);
  }
}
