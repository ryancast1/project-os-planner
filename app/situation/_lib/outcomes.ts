import type { MarketInfo, Outcome } from "./types";
import { isProbability } from "./polymarket";

export function getPolymarketPercentages(market: MarketInfo, outcomes: Outcome[]) {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.currentPrice, 0);
  const normalized = market.kind === "multi" && market.normalizationEligible === true &&
    outcomes.length >= 2 && outcomes.length === market.outcomes.length &&
    outcomes.every((outcome) => market.outcomes.some((original) => original.tokenId === outcome.tokenId)) &&
    new Set(outcomes.map((outcome) => outcome.tokenId)).size === outcomes.length &&
    outcomes.every((outcome) => outcome.normalizationSafe === true && isProbability(outcome.currentPrice)) &&
    total >= 0.95 && total <= 1.05 &&
    outcomes.every((outcome) => Math.abs(outcome.currentPrice / total - outcome.currentPrice) <= 0.02);

  if (!normalized) {
    return {
      normalized: false,
      percentages: new Map(outcomes.map((outcome) => [
        outcome.tokenId,
        isProbability(outcome.currentPrice) ? Math.round(outcome.currentPrice * 100) : null,
      ])),
    };
  }

  // Largest-remainder rounding shares the rounding adjustment fairly. Giving
  // the entire error to the leader can badly distort events with many choices.
  const exact = outcomes.map((outcome) => outcome.currentPrice / total * 100);
  const rounded = exact.map(Math.floor);
  const remainderOrder = exact.map((value, i) => ({ i, fraction: value - rounded[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const remaining = 100 - rounded.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < remaining; i++) rounded[remainderOrder[i].i] += 1;
  return {
    normalized: true,
    percentages: new Map(outcomes.map((outcome, i) => [outcome.tokenId, rounded[i]])),
  };
}

export function formatPolymarketPercentage(value: number | null | undefined): string {
  return value == null ? "--" : `${value}%`;
}

export function getVisiblePolymarketOutcomes(
  outcomes: Outcome[],
  compact: boolean,
  context?: { title?: string; label?: string; outcomeNames?: readonly string[] },
): Outcome[] {
  const isMargin = [context?.title, context?.label].some((title) => /\bmargin\b/i.test(title ?? ""))
    && Math.max(outcomes.length, context?.outcomeNames?.length ?? 0) > 2;
  if (isMargin) {
    const ranked = outcomes.filter((outcome) => isProbability(outcome.currentPrice))
      .sort((a, b) => b.currentPrice - a.currentPrice);
    const qualifying = ranked.filter((outcome) => outcome.currentPrice >= 0.1);
    // Select the strongest choices first, then order only their display labels.
    const visible = qualifying.length > 0 ? qualifying.slice(0, 4) : ranked.slice(0, 1);
    return visible.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }));
  }

  if (!compact) return outcomes.slice(0, 4);

  const visible = outcomes.filter((outcome) => isProbability(outcome.currentPrice) && outcome.currentPrice >= 0.05);

  return visible.length > 0 ? visible : outcomes.slice(0, 1);
}
