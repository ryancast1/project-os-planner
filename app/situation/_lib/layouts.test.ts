import assert from "node:assert/strict";
import { test } from "node:test";
import { LAYOUT_CONFIGS, LAYOUT_OPTIONS } from "./constants";
import { normalizeLayout, normalizeSavedView, storedLayout } from "./layouts";
import { loadActiveViewId, loadLocalState, saveLayout, saveTimeRange } from "./storage";

test("7x4 is a normal 28-market layout option and TV is only a legacy alias", () => {
  assert.deepEqual(LAYOUT_OPTIONS.map((option) => option.value), ["1", "2", "2x2", "3x2", "4x2", "7x4"]);
  assert.equal(LAYOUT_CONFIGS["7x4"].cols, 7);
  assert.equal(LAYOUT_CONFIGS["7x4"].rows, 4);
  assert.equal(LAYOUT_CONFIGS["7x4"].panelCount, 28);
  assert.equal(normalizeLayout("TV"), "7x4");
  assert.equal(normalizeLayout("7x4"), "7x4");
  assert.equal(normalizeLayout("unknown"), null);
  assert.equal(normalizeLayout(null), null);
});

test("loading a saved TV preset preserves its ID, title, timestamps, and all 28 market slots", () => {
  const panels = Array.from({ length: 28 }, (_, i) => `market-${i}`);
  panels[27] = "builtin:sp500";
  const original = { id: "original-tv", user_id: "owner", title: "TV", layout: "TV", panels, created_at: "2026-10-30" };
  const loaded = normalizeSavedView(original)!;
  assert.deepEqual(loaded, { ...original, layout: "7x4" });
  assert.equal(loaded.panels, panels);
  assert.equal(original.layout, "TV");
  assert.equal(loaded.panels[27], "builtin:sp500");
});

test("multiple 7x4 presets round-trip through the existing database layout value without schema changes", () => {
  for (const title of ["TV", "House results"]) {
    const view = { id: title, user_id: "owner", title, layout: storedLayout("7x4"), panels: ["market-a", null], created_at: "2026-11-01" };
    assert.equal(view.layout, "TV");
    assert.deepEqual(normalizeSavedView(view), { ...view, layout: "7x4" });
  }
  assert.equal(storedLayout("3x2"), "3x2");
  assert.equal(normalizeSavedView({ id: "bad", user_id: "owner", title: "Bad", layout: "bad", panels: [], created_at: "" }), null);
});

function withStorage(values: Record<string, string>, run: (data: Map<string, string>) => void) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map(Object.entries(values));
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
  try { run(data); } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("legacy local TV state restores all panels and the same saved-view selection", () => {
  const panels = Array.from({ length: 28 }, (_, i) => `market-${i}`);
  withStorage({ "situation-layout": "TV", "situation-panels": JSON.stringify(panels), "situation-active-view": "original-tv" }, () => {
    assert.deepEqual(loadLocalState().panels, panels);
    assert.equal(loadLocalState().layout, "7x4");
    assert.equal(loadActiveViewId(), "original-tv");
    saveLayout("7x4");
    assert.deepEqual(loadLocalState().panels, panels);
  });
});

test("retired time ranges fall back to 1D without losing layouts, panels, or saved-view selection", () => {
  const panels = Array.from({ length: 28 }, (_, i) => `market-${i}`);
  withStorage({ "situation-layout": "TV", "situation-panels": JSON.stringify(panels), "situation-active-view": "original-tv", "situation-tv-election-night": "true", "situation-timerange": "Election Night" }, (data) => {
    assert.deepEqual(loadLocalState(), { layout: "7x4", panels, timeRange: "1D" });
    assert.equal(loadActiveViewId(), "original-tv");
    saveTimeRange(loadLocalState().timeRange);
    assert.equal(data.get("situation-timerange"), "1D");
    assert.equal(data.has("situation-tv-election-night"), false);
    saveLayout("3x2");
    assert.equal(loadLocalState().timeRange, "1D");
    saveTimeRange("1H");
    saveLayout("7x4");
    assert.equal(loadLocalState().timeRange, "1H");
  });
});

test("a legacy election flag cannot override a supported saved time range in any layout", () => {
  for (const layout of ["1", "2", "2x2", "3x2", "4x2", "7x4"]) {
    for (const range of ["1H", "4H", "1D", "1W", "1M", "3M", "1Y", "5Y", "All"] as const) {
      withStorage({ "situation-layout": layout, "situation-tv-election-night": "true", "situation-timerange": range }, () => {
        assert.equal(loadLocalState().timeRange, range);
      });
    }
  }
});
