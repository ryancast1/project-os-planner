import { COLOR_GREEN, COLOR_RED } from "./constants";
import { getOutcomeColor } from "./colors";
import { isProbability } from "./polymarket";
import type { MarketInfo, Outcome, OutcomeColors, PricePoint, StockSnapshot } from "./types";

export const MOVER_RANGES = [
  { value: "1D", label: "1 day", seconds: 86400, tolerance: 900 },
  { value: "1H", label: "1 hour", seconds: 3600, tolerance: 300 },
  { value: "10M", label: "10 min", seconds: 600, tolerance: 120 },
] as const;
export type MoverRange = typeof MOVER_RANGES[number]["value"];
export const MOVER_REFRESH_MS = 30_000;
export type MoverCache = {
  histories: Record<string, PricePoint[]>;
  stock?: StockSnapshot;
  pendingHistories?: Map<string, Promise<PricePoint[]>>;
};

export function isMoverEligibleMarket(market: MarketInfo, outcomes: Outcome[] = market.outcomes): boolean {
  // Count all active choices, including low-price choices hidden from charts.
  return Math.max(market.outcomeNames?.length ?? 0, market.outcomes.length, outcomes.length) <= 3;
}

export function combineMoverHistories(outcomes: Outcome[], cached: Record<string, PricePoint[]>): Record<string, PricePoint[]> {
  return Object.fromEntries(outcomes.map((outcome) => [outcome.tokenId, [...(cached[outcome.tokenId] ?? []), ...outcome.history]]));
}

export function mergeMoverHistory(cached: PricePoint[], incoming: PricePoint[]): PricePoint[] {
  const points = new Map(cached.map((point) => [point.t, point]));
  for (const point of incoming) {
    if (Number.isFinite(point.t) && Number.isFinite(point.p)) points.set(point.t, point);
  }
  return [...points.values()].sort((a, b) => a.t - b.t).slice(-2048);
}

export function getMissingMoverTokens(outcomes: Outcome[], histories: Record<string, PricePoint[]>, range: MoverRange, now: number): string[] {
  const { target, tolerance } = getMoverWindow(range, now);
  const precision = range === "1D" ? 300 : 60;
  return outcomes.filter((outcome) => {
    const baseline = getMoverBaseline(histories[outcome.tokenId] ?? [], target, tolerance);
    return !baseline || !isProbability(baseline.p) || target - baseline.t > precision;
  }).map((outcome) => outcome.tokenId);
}

export type MarketMover = {
  marketId: string;
  range: MoverRange;
  score: number;
  change: number;
  outcomeName: string;
  color: string;
  unit: "pp" | "%";
  asOf: number;
};

export function getMoverWindow(range: MoverRange, now: number) {
  const config = MOVER_RANGES.find((option) => option.value === range)!;
  const target = now - config.seconds;
  return { target, tolerance: config.tolerance, start: target - config.tolerance };
}

// Never substitute a point after the requested baseline or a very old quote.
export function getMoverBaseline(history: PricePoint[], target: number, tolerance: number): PricePoint | null {
  let baseline: PricePoint | null = null;
  for (const point of history) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.p) ||
      point.t > target || point.t < target - tolerance) continue;
    if (!baseline || point.t > baseline.t) baseline = point;
  }
  return baseline;
}

export function getPolymarketMover(
  marketId: string,
  range: MoverRange,
  market: MarketInfo,
  outcomes: Outcome[],
  chartOutcomes: Outcome[],
  histories: Record<string, PricePoint[]>,
  now: number,
  overrides?: OutcomeColors,
): MarketMover | null {
  if (!isMoverEligibleMarket(market, outcomes)) return null;
  const { target, tolerance } = getMoverWindow(range, now);
  let biggestMove: MarketMover | null = null;
  let biggestRise: MarketMover | null = null;
  for (const outcome of outcomes) {
    if (!outcome.priceIsFresh || !isProbability(outcome.currentPrice)) continue;
    const baseline = getMoverBaseline(histories[outcome.tokenId] ?? [], target, tolerance);
    if (!baseline || !isProbability(baseline.p)) continue;
    // Use raw percentage points, not relative growth or display normalization.
    const change = Math.round((outcome.currentPrice - baseline.p) * 100 * 1e9) / 1e9;
    if (change === 0) continue;
    const visibleIndex = chartOutcomes.findIndex((visible) => visible.tokenId === outcome.tokenId);
    const index = visibleIndex >= 0 ? visibleIndex : outcomes.indexOf(outcome);
    const candidate: MarketMover = {
      marketId, range, score: Math.abs(change), change, outcomeName: outcome.name,
      color: getOutcomeColor(outcome, index, overrides, market.outcomeNames ?? outcomes.map((o) => o.name)),
      unit: "pp", asOf: now,
    };
    if (!biggestMove || candidate.score > biggestMove.score) biggestMove = candidate;
    if (change > 0 && (!biggestRise || change > biggestRise.change)) biggestRise = candidate;
  }
  if (!biggestMove) return null;
  // Rank the market's full move, but prefer the gaining side's chart color.
  // Independent books can reprice one side first, so declines must still count.
  return { ...(biggestRise ?? biggestMove), score: biggestMove.score };
}

export function hasStockMoverCoverage(range: MoverRange, snapshot: StockSnapshot, now: number): boolean {
  const { target, tolerance } = getMoverWindow(range, now);
  const baseline = getMoverBaseline(snapshot.history, target, tolerance);
  const latest = getMoverBaseline(snapshot.history, now, 180);
  return !!baseline && baseline.p > 0 && !!latest && latest.t > target;
}

export function getStockMover(marketId: string, range: MoverRange, snapshot: StockSnapshot, now: number): MarketMover | null {
  if (!hasStockMoverCoverage(range, snapshot, now)) return null;
  const { target, tolerance } = getMoverWindow(range, now);
  const baseline = getMoverBaseline(snapshot.history, target, tolerance)!;
  const latest = getMoverBaseline(snapshot.history, now, 180)!;
  const change = (latest.p / baseline.p - 1) * 100;
  if (!Number.isFinite(change) || Math.abs(change) < 1e-9) return null;
  return {
    marketId, range, score: Math.abs(change), change, outcomeName: snapshot.label,
    color: change > 0 ? COLOR_GREEN : COLOR_RED, unit: "%", asOf: now,
  };
}

export function getTopMovers(candidates: (MarketMover | null)[], range: MoverRange | null, marketIds: (string | null)[], now: number): MarketMover[] {
  if (!range) return [];
  const visible = new Set(marketIds);
  const unique = new Map<string, MarketMover>();
  for (const candidate of candidates) {
    if (!candidate || candidate.range !== range || !visible.has(candidate.marketId) ||
      !Number.isFinite(candidate.score) || candidate.score <= 0 ||
      candidate.asOf > now || now - candidate.asOf > 90) continue;
    const prior = unique.get(candidate.marketId);
    if (!prior || candidate.asOf >= prior.asOf) unique.set(candidate.marketId, candidate);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || a.marketId.localeCompare(b.marketId)).slice(0, 3);
}

export function describeMover(mover: MarketMover): string {
  const label = MOVER_RANGES.find((option) => option.value === mover.range)!.label;
  return `Top mover over ${label}: ${mover.outcomeName} ${mover.change > 0 ? "+" : ""}${mover.change.toFixed(2)}${mover.unit === "pp" ? " percentage points" : "%"}.`;
}
