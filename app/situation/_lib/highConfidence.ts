import type { MarketInfo, Outcome, OutcomeColors } from "./types";
import { getOutcomeColor } from "./colors";
import { isProbability } from "./polymarket";

export const HIGH_CONFIDENCE_THRESHOLD = 0.985;

export function getHighConfidenceOutcome(
  market: MarketInfo | null,
  outcomes: Outcome[],
  chartOutcomes: Outcome[],
  overrides?: OutcomeColors,
): { outcome: Outcome; color: string } | null {
  if (!market?.mutuallyExclusive) return null;
  // Use raw prices, never normalized or rounded display percentages. Multiple
  // apparent winners indicate conflicting data rather than a decided race.
  const leaders = outcomes.filter((outcome) => isProbability(outcome.currentPrice) &&
    outcome.currentPrice >= HIGH_CONFIDENCE_THRESHOLD);
  if (leaders.length !== 1 || leaders[0].priceIsFresh !== true) return null;
  const outcome = leaders[0];
  const chartIndex = chartOutcomes.findIndex((choice) => choice.tokenId === outcome.tokenId);
  const index = chartIndex >= 0 ? chartIndex : outcomes.indexOf(outcome);
  // Above the threshold, the background follows this outcome's party even when the
  // chart uses distinct palette colors for several same-party alternatives.
  return { outcome, color: getOutcomeColor(outcome, index, overrides) };
}
