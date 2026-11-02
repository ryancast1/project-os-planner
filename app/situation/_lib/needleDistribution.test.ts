import assert from "node:assert/strict";
import { test } from "node:test";
import { COLORS } from "./constants";
import { formatNeedleSlice, getNeedleDistribution } from "./needleDistribution";
import type { MarketInfo, Outcome } from "./types";

const choice = (tokenId: string, currentPrice: number, name = tokenId): Outcome => ({ tokenId, name, currentPrice, history: [], priceIsFresh: true, normalizationSafe: true });
const market = (outcomes: Outcome[], extra: Partial<MarketInfo> = {}): MarketInfo => ({ title: "Election winner", kind: "multi", mutuallyExclusive: true,
  normalizationEligible: true, outcomes, outcomeNames: outcomes.map((outcome) => outcome.name), ...extra });

test("two-outcome markets keep their existing needle rather than becoming a distribution", () => {
  const outcomes = [choice("a", 0.6), choice("b", 0.4)];
  assert.equal(getNeedleDistribution(market(outcomes), outcomes), null);
});

test("exclusive outcome arcs represent the whole market rather than a top-two comparison", () => {
  const outcomes = [choice("a", 0.4), choice("b", 0.3), choice("c", 0.2), choice("d", 0.1)];
  const result = getNeedleDistribution(market(outcomes), outcomes)!;
  assert.equal(result.slices.length, 4);
  result.slices.forEach((slice, index) => assert(Math.abs(slice.share - [0.4, 0.3, 0.2, 0.1][index]) < 1e-9));
  assert.deepEqual(result.slices.map(formatNeedleSlice), ["40%", "30%", "20%", "10%"]);
  assert.equal(result.relative, false);
  assert.equal(result.unpriced, 0);
});

test("up to four main choices remain visible and the tail is grouped into Other", () => {
  const outcomes = [choice("a", 0.4), choice("b", 0.25), choice("c", 0.15), choice("d", 0.1), choice("e", 0.06), choice("f", 0.04)];
  const result = getNeedleDistribution(market(outcomes), outcomes)!;
  assert.deepEqual(result.slices.map((slice) => slice.key), ["a", "b", "c", "d", "group:other"]);
  assert.deepEqual(result.slices.at(-1)?.members, ["e", "f"]);
  assert.equal(result.slices.at(-1)?.displayPercent, 10);
  assert(Math.abs(result.slices.reduce((sum, slice) => sum + slice.share, 0) - 1) < 1e-9);
});

test("margin distributions retain the 10% cutoff, four main choices, natural ordering and assigned colors", () => {
  const outcomes = [choice("a", 0.4, "Democrat 15-20%"), choice("b", 0.26, "Democrat 10-15%"), choice("c", 0.13, "Democrat 5-10%"),
    choice("d", 0.1, "Democrat 20-25%"), choice("e", 0.05, "Democrat 0-5%"), choice("f", 0.03, "Republican Wins")];
  const result = getNeedleDistribution(market(outcomes), outcomes, { b: "pink" }, "Governor - Margin")!;
  assert.deepEqual(result.slices.map((slice) => slice.label), ["DEM 5-10%", "DEM 10-15%", "DEM 15-20%", "DEM 20-25%", "Other"]);
  assert.deepEqual(result.slices.map((slice) => slice.displayPercent), [14, 27, 41, 10, 8]);
  assert.equal(result.slices[1].color, COLORS[5]);
  assert.deepEqual(result.slices.at(-1)?.members, ["Democrat 0-5%", "Republican Wins"]);
});

test("missing low-price choices remain an explicitly unpriced remainder instead of inflating the displayed options", () => {
  const outcomes = [choice("a", 0.4), choice("b", 0.3), choice("c", 0.2)];
  const result = getNeedleDistribution(market(outcomes, { normalizationEligible: false, outcomeNames: ["a", "b", "c", "missing"] }), outcomes)!;
  assert.deepEqual(result.slices.map((slice) => slice.displayPercent), [40, 30, 20, 10]);
  assert(Math.abs(result.unpriced - 0.1) < 1e-9);
  assert(result.context.includes("10% unpriced"));
  assert(result.slices.at(-1)?.name.includes("unpriced"));
});

test("overlapping outcomes use clearly labeled relative sizes without changing their raw percentages", () => {
  const outcomes = [choice("a", 0.7), choice("b", 0.6), choice("c", 0.2)];
  const result = getNeedleDistribution(market(outcomes, { mutuallyExclusive: false }), outcomes)!;
  assert.equal(result.relative, true);
  assert(result.context.includes("not exclusive odds"));
  assert.deepEqual(result.slices.map((slice) => slice.displayPercent), [70, 60, 20]);
  assert(Math.abs(result.slices[0].share - 0.7 / 1.5) < 1e-9);
  assert.equal(result.unpriced, 0);
});

test("independent prices are not normalized even if other metadata flags are inconsistent", () => {
  const outcomes = [choice("a", 0.605), choice("b", 0.305), choice("c", 0.1)];
  const result = getNeedleDistribution(market(outcomes, { mutuallyExclusive: false }), outcomes)!;
  assert.equal(result.relative, true);
  assert.deepEqual(result.slices.map((slice) => slice.displayPercent), [61, 31, 10]);
});

test("unsafe overround prices remain raw rather than silently becoming a probability distribution", () => {
  const outcomes = [choice("a", 0.8), choice("b", 0.5), choice("c", 0.1)];
  const result = getNeedleDistribution(market(outcomes), outcomes)!;
  assert.equal(result.relative, true);
  assert.deepEqual(result.slices.map((slice) => slice.displayPercent), [80, 50, 10]);
});

test("a genuine Other choice merges into one group without shifting other choices' chart colors", () => {
  const outcomes = [choice("other", 0.4, "Other"), choice("b", 0.3), choice("c", 0.2), choice("d", 0.1)];
  const result = getNeedleDistribution(market(outcomes), outcomes)!;
  assert.equal(result.slices.filter((slice) => slice.label === "Other").length, 1);
  assert.equal(result.slices[0].color, COLORS[1]);
  assert.equal(result.slices.at(-1)?.displayPercent, 40);
});

test("tiny grouped shares display less than one percent instead of a misleading zero", () => {
  const outcomes = [choice("a", 0.6), choice("b", 0.3), choice("c", 0.099), choice("d", 0.001)];
  const result = getNeedleDistribution(market(outcomes), outcomes)!;
  assert.equal(formatNeedleSlice(result.slices.at(-1)!), "<1%");
});

test("bad, stale or duplicate data cannot fabricate a pie and valid input is never mutated", () => {
  const outcomes = [choice("a", 0.5), choice("b", 0.3), choice("c", 0.2)];
  const original = structuredClone(outcomes);
  getNeedleDistribution(market(outcomes), outcomes);
  assert.deepEqual(outcomes, original);
  for (const price of [NaN, Infinity, -1, 2]) {
    outcomes[0].currentPrice = price;
    assert.equal(getNeedleDistribution(market(outcomes), outcomes), null);
  }
  outcomes[0].currentPrice = 0.5;
  outcomes[0].priceIsFresh = false;
  assert.equal(getNeedleDistribution(market(outcomes), outcomes), null);
  assert.equal(getNeedleDistribution(market(original), [original[0], original[0], original[1]]), null);
  assert.equal(getNeedleDistribution(market(original), original.map((outcome) => ({ ...outcome, currentPrice: 0 }))), null);
});
