import { COLORS } from "./constants";
import { getOutcomeColors } from "./colors";
import { getTVOutcomeName } from "./outcomeLabels";
import { getPolymarketPercentages } from "./outcomes";
import { isProbability } from "./polymarket";
import type { MarketInfo, Outcome, OutcomeColors } from "./types";

export const NEEDLE_MODE_KEY = "situation-needle-mode";
const NEUTRAL = "#949b9e";
export type NeedleSide = { name: string; label: string; probability: number; color: string };
export type NeedleModel = {
  left: NeedleSide;
  right: NeedleSide;
  leftProbability: number;
  headline: string;
  detail: string;
  color: string;
  context: string;
  kind: "pair" | "leader";
};

export function needleRotation(probability: number): number {
  if (!Number.isFinite(probability)) return 0;
  const chance = Math.max(0, Math.min(1, probability));
  const breaks = [0, 0.05, 0.25, 0.45, 0.55, 0.75, 0.95, 1];
  const segment = Math.min(6, breaks.findIndex((edge, index) => index > 0 && chance <= edge) - 1);
  const fraction = (chance - breaks[segment]) / (breaks[segment + 1] - breaks[segment]);
  return Math.round((90 - (segment + fraction) / 7 * 180) * 1e9) / 1e9;
}

export function needleVerdict(probability: number): string {
  if (probability < 0.55) return "Tossup";
  if (probability < 0.65) return "Tilting";
  if (probability < 0.75) return "Leaning";
  if (probability < 0.95) return "Likely";
  return "Very likely";
}

export function getNeedleModel(market: MarketInfo, outcomes: Outcome[], overrides?: OutcomeColors): NeedleModel | null {
  const names = market.outcomeNames ?? market.outcomes.map((outcome) => outcome.name);
  const colors = getOutcomeColors(outcomes, overrides, names);
  const valid = outcomes.filter((outcome) => isProbability(outcome.currentPrice) && outcome.priceIsFresh !== false);
  if (!valid.length || valid.length !== outcomes.length) return null;
  const side = (outcome: Outcome): NeedleSide => ({
    name: outcome.name, label: getTVOutcomeName(outcome.name, names), probability: outcome.currentPrice,
    color: colors[outcomes.indexOf(outcome)],
  });
  const total = valid.reduce((sum, outcome) => sum + outcome.currentPrice, 0);
  const completePair = market.mutuallyExclusive && valid.length === 2 && outcomes.length === 2
    && Math.max(names.length, market.outcomes.length) === 2
    && new Set(valid.map((outcome) => outcome.tokenId)).size === 2
    && valid.every((outcome) => market.outcomes.some((original) => original.tokenId === outcome.tokenId));
  const normalized = getPolymarketPercentages(market, outcomes).normalized;
  let left: NeedleSide;
  let right: NeedleSide;
  let kind: NeedleModel["kind"];
  if (completePair && (normalized || Math.abs(total - 1) <= 0.020000001)) {
    [left, right] = valid.map(side);
    // Honor the chart's assigned colors while keeping blue left and red right.
    if (left.color === COLORS[3] || right.color === COLORS[1]) [left, right] = [right, left];
    if (normalized) {
      left = { ...left, probability: left.probability / total };
      right = { ...right, probability: right.probability / total };
    }
    kind = "pair";
  } else {
    // Never normalize only the top two choices or sum an incomplete field.
    const leader = [...valid].sort((a, b) => b.currentPrice - a.currentPrice || a.tokenId.localeCompare(b.tokenId))[0];
    left = side(leader);
    right = {
      name: market.mutuallyExclusive ? "All other outcomes" : `Not ${leader.name}`,
      label: market.mutuallyExclusive ? "Rest" : "No", probability: 1 - leader.currentPrice, color: NEUTRAL,
    };
    if (left.color === COLORS[3]) [left, right] = [right, left];
    kind = "leader";
  }
  const favorite = left.probability >= right.probability ? left : right;
  const verdict = needleVerdict(favorite.probability);
  const leader = kind === "leader" ? (left.color === NEUTRAL ? right : left) : favorite;
  return {
    left, right, leftProbability: favorite === left ? left.probability : 1 - right.probability, kind,
    headline: verdict === "Tossup" ? verdict : `${verdict} ${favorite.label}`,
    detail: kind === "pair" && left.probability === 0.5 && right.probability === 0.5
      ? "50% each" : `${Math.round(leader.probability * 100)}% ${leader.label}`,
    color: verdict === "Tossup" ? "#666c70" : favorite.color,
    context: kind === "pair" ? "Market odds" : market.mutuallyExclusive ? "Leading option vs. rest" : "Leading option: yes vs. no",
  };
}

export function loadNeedleMode(): boolean {
  try { return window.localStorage.getItem(NEEDLE_MODE_KEY) === "true"; } catch { return false; }
}

export function saveNeedleMode(enabled: boolean): void {
  try { window.localStorage.setItem(NEEDLE_MODE_KEY, String(enabled)); } catch { /* The toggle still works without persistence. */ }
}
