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
export const MOVER_MIN_CHANGE = 3;
export const MOVER_MAX_HIGHLIGHTS = 5;
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
  return Object.fromEntries(outcomes.map((outcome) => [outcome.tokenId,
    [...new Map([...(cached[outcome.tokenId] ?? []), ...outcome.history].map((point) => [point.t, point])).values()],
  ]));
}

export function mergeMoverHistory(cached: PricePoint[], incoming: PricePoint[]): PricePoint[] {
  const points = new Map(cached.map((point) => [point.t, point]));
  for (const point of incoming) {
    if (Number.isFinite(point.t) && Number.isFinite(point.p)) points.set(point.t, point);
  }
  return [...points.values()].sort((a, b) => a.t - b.t).slice(-2048);
}

export function getMissingMoverTokens(outcomes: Outcome[], histories: Record<string, PricePoint[]>, range: MoverRange, now: number): string[] {
  return outcomes.filter((outcome) => !getPolymarketBaseline(histories[outcome.tokenId] ?? [], range, now))
    .map((outcome) => outcome.tokenId);
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
  /** Direction inferred from the other side's decline, not a fabricated gain. */
  towardOutcomeName?: string;
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

function getPolymarketBaseline(history: PricePoint[], range: MoverRange, now: number): PricePoint | null {
  const { target } = getMoverWindow(range, now);
  const precision = range === "1D" ? 300 : 60;
  return getMoverBaseline(history.filter((point) => isProbability(point.p)), target, precision);
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
  const moves: (MarketMover & { tokenId: string })[] = [];
  for (const outcome of outcomes) {
    if (!outcome.priceIsFresh || !isProbability(outcome.currentPrice)) continue;
    const baseline = getPolymarketBaseline(histories[outcome.tokenId] ?? [], range, now);
    if (!baseline) continue;
    // Use raw percentage points, not relative growth or display normalization.
    const change = Math.round((outcome.currentPrice - baseline.p) * 100 * 1e9) / 1e9;
    const visibleIndex = chartOutcomes.findIndex((visible) => visible.tokenId === outcome.tokenId);
    const index = visibleIndex >= 0 ? visibleIndex : outcomes.indexOf(outcome);
    moves.push({
      marketId, range, score: Math.abs(change), change, outcomeName: outcome.name,
      tokenId: outcome.tokenId,
      color: getOutcomeColor(outcome, index, overrides, market.outcomeNames ?? outcomes.map((o) => o.name)),
      unit: "pp", asOf: now,
    });
  }
  moves.sort((a, b) => b.score - a.score || b.change - a.change || a.tokenId.localeCompare(b.tokenId));
  const completePair = market.mutuallyExclusive && outcomes.length === 2
    && Math.max(market.outcomeNames?.length ?? 0, market.outcomes.length) === 2
    && new Set(outcomes.map((outcome) => outcome.tokenId)).size === 2
    && outcomes.every((outcome) => market.outcomes.some((original) => original.tokenId === outcome.tokenId));
  if (!completePair) {
    // With multiple/independent choices, a decline has no unique beneficiary.
    return moves.find((move) => move.change > 0) ?? null;
  }
  const strongest = moves[0];
  if (!strongest || strongest.change === 0) return null;
  if (strongest.change > 0) return strongest;
  const opposite = moves.find((move) => move.tokenId !== strongest.tokenId);
  if (!opposite || opposite.change < 0) return null;
  return { ...strongest, color: opposite.color, towardOutcomeName: opposite.outcomeName };
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
      !Number.isFinite(candidate.score) || candidate.score < MOVER_MIN_CHANGE ||
      candidate.asOf > now || now - candidate.asOf > 90) continue;
    const prior = unique.get(candidate.marketId);
    if (!prior || candidate.asOf >= prior.asOf) unique.set(candidate.marketId, candidate);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || a.marketId.localeCompare(b.marketId)).slice(0, MOVER_MAX_HIGHLIGHTS);
}

export function describeMover(mover: MarketMover): string {
  const label = MOVER_RANGES.find((option) => option.value === mover.range)!.label;
  const direction = mover.towardOutcomeName ? ` Direction: away from ${mover.outcomeName}, toward ${mover.towardOutcomeName}.` : "";
  return `Top mover over ${label}: ${mover.outcomeName} ${mover.change > 0 ? "+" : ""}${mover.change.toFixed(2)}${mover.unit === "pp" ? " percentage points" : "%"}.${direction}`;
}
