import type { TimeRangeLabel, LayoutMode, BuiltinMarket } from "./types";

export const PROXY = "/situation/api";
export const REFRESH_INTERVAL_MS = 12_000;
export const STOCK_REFRESH_INTERVAL_MS = 30_000;

export const TIME_RANGES = [
  { label: "1H" as const, seconds: 3600 },
  { label: "4H" as const, seconds: 4 * 3600 },
  { label: "1D" as const, seconds: 24 * 3600 },
  { label: "1W" as const, seconds: 7 * 24 * 3600 },
  { label: "1M" as const, seconds: 30 * 24 * 3600 },
  { label: "3M" as const, seconds: 90 * 24 * 3600 },
  { label: "All" as const, seconds: 0 },
];

export function getStartTs(label: TimeRangeLabel): number {
  const range = TIME_RANGES.find((r) => r.label === label)!;
  if (range.seconds === 0) return 0;
  return Math.floor(Date.now() / 1000) - range.seconds;
}

export function getFidelity(label: TimeRangeLabel): number {
  switch (label) {
    case "1H":
    case "4H":
      return 1;
    case "1D":
      return 5;
    case "1W":
      return 30;
    case "1M":
      return 60;
    case "3M":
    case "All":
      return 360;
  }
}

/** Map our time range labels to Yahoo Finance range + interval params */
export function getYahooParams(label: TimeRangeLabel): { range: string; interval: string } {
  switch (label) {
    case "1H": return { range: "1d", interval: "2m" };
    case "4H": return { range: "1d", interval: "5m" };
    case "1D": return { range: "1d", interval: "5m" };
    case "1W": return { range: "5d", interval: "30m" };
    case "1M": return { range: "1mo", interval: "1d" };
    case "3M": return { range: "3mo", interval: "1d" };
    case "All": return { range: "max", interval: "1wk" };
  }
}

export const COLORS = [
  "rgba(0, 200, 83, 0.95)",
  "rgba(59, 130, 246, 0.95)",
  "rgba(251, 191, 36, 0.95)",
  "rgba(239, 68, 68, 0.95)",
  "rgba(168, 85, 247, 0.95)",
  "rgba(236, 72, 153, 0.95)",
  "rgba(20, 184, 166, 0.95)",
  "rgba(249, 115, 22, 0.95)",
];

export const COLOR_RED = "rgba(239, 68, 68, 0.95)";
export const COLOR_GREEN = "rgba(0, 200, 83, 0.95)";

// -- Built-in (hardcoded) markets --

export const BUILTIN_MARKETS: BuiltinMarket[] = [
  { id: "builtin:sp500",  label: "S&P 500",    ticker: "^GSPC",   category: "Stocks" },
  { id: "builtin:nasdaq", label: "NASDAQ",     ticker: "^IXIC",   category: "Stocks" },
  { id: "builtin:dow",    label: "Dow Jones",  ticker: "^DJI",    category: "Stocks" },
  { id: "builtin:br",     label: "Broadridge", ticker: "BR",      category: "Stocks" },
  { id: "builtin:btc",    label: "Bitcoin",    ticker: "BTC-USD", category: "Crypto/Commodities" },
  { id: "builtin:gold",   label: "Gold",       ticker: "GC=F",    category: "Crypto/Commodities" },
];

// Unique categories in display order
export const BUILTIN_CATEGORIES = [...new Set(BUILTIN_MARKETS.map((m) => m.category))];

/** US equity builtins that trade 9:30 AM – 4:00 PM ET */
export const US_EQUITY_BUILTIN_IDS = new Set([
  "builtin:sp500",
  "builtin:nasdaq",
  "builtin:dow",
  "builtin:br",
]);

/**
 * Given any Unix timestamp, returns the NYSE market open (9:30 AM ET) and
 * close (4:00 PM ET) for the Eastern-timezone calendar date of that timestamp.
 * Automatically handles EST (UTC-5) vs EDT (UTC-4).
 */
export function getMarketHoursForTs(ts: number): { openTs: number; closeTs: number } {
  const date = new Date(ts * 1000);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0");

  const nyYear  = get("year");
  const nyMonth = get("month") - 1; // 0-indexed
  const nyDay   = get("day");
  const nyHour  = get("hour") % 24; // guard against "24" returned for midnight
  const nyMin   = get("minute");

  // Eastern UTC offset in minutes (-300 = EST, -240 = EDT)
  const utcHour = date.getUTCHours();
  const utcMin  = date.getUTCMinutes();
  let offsetMins = nyHour * 60 + nyMin - (utcHour * 60 + utcMin);
  if (offsetMins >  720) offsetMins -= 1440;
  if (offsetMins < -720) offsetMins += 1440;

  // UTC milliseconds for midnight of the Eastern date
  const dayStartUtc = Date.UTC(nyYear, nyMonth, nyDay);

  // 9:30 AM ET  → add (9h30m - offsetMins) from UTC midnight
  // 4:00 PM ET  → add (16h00m - offsetMins) from UTC midnight
  const openUtcMs  = dayStartUtc + (9 * 60 + 30 - offsetMins) * 60_000;
  const closeUtcMs = dayStartUtc + (16 * 60       - offsetMins) * 60_000;

  return {
    openTs:  Math.floor(openUtcMs  / 1000),
    closeTs: Math.floor(closeUtcMs / 1000),
  };
}

// -- Layout configs --

export type LayoutConfig = {
  cols: number;
  rows: number;
  gridClass: string;
  panelCount: number;
};

export const LAYOUT_CONFIGS: Record<LayoutMode, LayoutConfig> = {
  "1": { cols: 1, rows: 1, gridClass: "grid-cols-1 grid-rows-1", panelCount: 1 },
  "2": { cols: 2, rows: 1, gridClass: "grid-cols-2 grid-rows-1", panelCount: 2 },
  "2x2": { cols: 2, rows: 2, gridClass: "grid-cols-2 grid-rows-2", panelCount: 4 },
  "3x2": {
    cols: 3,
    rows: 2,
    gridClass: "grid-cols-2 md:grid-cols-3 grid-rows-3 md:grid-rows-2",
    panelCount: 6,
  },
  "4x2": {
    cols: 4,
    rows: 2,
    gridClass: "grid-cols-2 md:grid-cols-4 grid-rows-4 md:grid-rows-2",
    panelCount: 8,
  },
};

export const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "2x2", label: "2\u00d72" },
  { value: "3x2", label: "3\u00d72" },
  { value: "4x2", label: "4\u00d72" },
];
