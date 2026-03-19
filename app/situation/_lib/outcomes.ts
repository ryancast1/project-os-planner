import type { Outcome } from "./types";

export function getVisiblePolymarketOutcomes(
  outcomes: Outcome[],
  compact: boolean
): Outcome[] {
  if (!compact) return outcomes.slice(0, 4);

  const sum = outcomes.reduce((total, outcome) => total + outcome.currentPrice, 0) || 1;
  const visible = outcomes.filter((outcome) => (outcome.currentPrice / sum) * 100 >= 5);

  return visible.length > 0 ? visible : outcomes.slice(0, 1);
}
