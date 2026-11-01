import type { Outcome, PricePoint } from "./types";
import { isProbability } from "./polymarket";

export function findNearestPricePoint(history: PricePoint[], ts: number): PricePoint | null {
  if (history.length === 0 || !Number.isFinite(ts)) return null;
  let lo = 0;
  let hi = history.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].t < ts) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return history[0];
  const before = history[lo - 1];
  const after = history[lo];
  return Math.abs(before.t - ts) <= Math.abs(after.t - ts) ? before : after;
}

export function getHistoricalPrices(outcomes: Outcome[], timestamp: number): Record<string, number | null> {
  return Object.fromEntries(outcomes.map((outcome) => {
    const point = findNearestPricePoint(outcome.history, timestamp);
    return [outcome.tokenId, point && Number.isFinite(point.p) ? point.p : null];
  }));
}

export function formatHistoricalPercentage(price: number | null | undefined): string {
  return isProbability(price) ? `${Number((price * 100).toFixed(1))}%` : "--";
}
