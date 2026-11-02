import { getOutcomeColors } from "./colors";
import { getTVOutcomeName } from "./outcomeLabels";
import { getPolymarketPercentages, getVisiblePolymarketOutcomes } from "./outcomes";
import { isProbability } from "./polymarket";
import type { MarketInfo, Outcome, OutcomeColors } from "./types";

export type NeedleSlice = {
  key: string;
  name: string;
  label: string;
  color: string;
  share: number;
  displayPercent: number;
  members: string[];
  grouped: boolean;
};

export type NeedleDistribution = {
  slices: NeedleSlice[];
  relative: boolean;
  context: string;
  unpriced: number;
};

const isOther = (name: string) => /^(?:others?|other (?:options|outcomes|candidates))$/i.test(name.trim());

export function isNeedleDistributionMarket(market: MarketInfo, outcomes: readonly Outcome[]): boolean {
  return Math.max(market.outcomeNames?.length ?? 0, market.outcomes.length, outcomes.length) > 2;
}

export function getNeedleDistribution(
  market: MarketInfo, outcomes: Outcome[], overrides?: OutcomeColors, label?: string,
): NeedleDistribution | null {
  const names = market.outcomeNames ?? market.outcomes.map((outcome) => outcome.name);
  if (!isNeedleDistributionMarket(market, outcomes)) return null;
  if (!outcomes.length || new Set(outcomes.map((outcome) => outcome.tokenId)).size !== outcomes.length
    || outcomes.some((outcome) => !isProbability(outcome.currentPrice) || outcome.priceIsFresh === false)) return null;
  const total = outcomes.reduce((sum, outcome) => sum + outcome.currentPrice, 0);
  if (total <= 0) return null;
  const percentages = getPolymarketPercentages(market, outcomes);
  const normalized = market.mutuallyExclusive && percentages.normalized;
  const relative = !market.mutuallyExclusive || (!normalized && total > 1 + 1e-9);
  const unpriced = !relative && !normalized ? Math.max(0, 1 - total) : 0;
  const ranked = [...outcomes].sort((a, b) => b.currentPrice - a.currentPrice || a.tokenId.localeCompare(b.tokenId));
  const visible = getVisiblePolymarketOutcomes(ranked, true, { title: market.title, label, outcomeNames: names });
  const main = visible.filter((outcome) => !isOther(outcome.name) && outcome.currentPrice > 0).slice(0, 4);
  const colors = getOutcomeColors(visible, overrides, names);
  const denominator = normalized || relative ? total : 1;
  const slices: NeedleSlice[] = main.map((outcome) => ({
    key: outcome.tokenId, name: outcome.name, label: getTVOutcomeName(outcome.name, names), color: colors[visible.indexOf(outcome)],
    share: outcome.currentPrice / denominator,
    displayPercent: normalized ? percentages.percentages.get(outcome.tokenId) ?? 0 : Math.round(outcome.currentPrice * 100),
    members: [outcome.name], grouped: false,
  }));
  const mainIds = new Set(main.map((outcome) => outcome.tokenId));
  const remaining = outcomes.filter((outcome) => !mainIds.has(outcome.tokenId));
  const remainingPrice = remaining.reduce((sum, outcome) => sum + outcome.currentPrice, 0);
  const remainder = (remainingPrice + unpriced) / denominator;
  if (remainder > 1e-9) slices.push({
    key: "group:other", name: unpriced > 1e-9 ? "Other outcomes and unpriced remainder" : "Other outcomes", label: "Other",
    color: "#8e969b", share: remainder,
    displayPercent: relative ? Math.round(remainingPrice * 100)
      : Math.max(0, 100 - slices.reduce((sum, slice) => sum + slice.displayPercent, 0)),
    members: remaining.map((outcome) => outcome.name), grouped: true,
  });
  return {
    slices, relative, unpriced,
    context: relative ? "Relative market prices, not exclusive odds"
      : unpriced > 0.005 ? `Includes ${(unpriced * 100).toFixed(1).replace(/\.0$/, "")}% unpriced remainder`
        : slices.some((slice) => slice.grouped) ? "Market odds; smaller outcomes grouped" : "Market odds",
  };
}

export function formatNeedleSlice(slice: NeedleSlice): string {
  return slice.displayPercent === 0 && slice.share > 0 ? "<1%" : `${slice.displayPercent}%`;
}
