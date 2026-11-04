import assert from "node:assert/strict";
import { test } from "node:test";
import { COLORS } from "./constants";
import { getOutcomeColors } from "./colors";
import { getHighConfidenceOutcome } from "./highConfidence";
import { getPolymarketPercentages } from "./outcomes";
import { buildPolymarketInfo, hasFreshPolymarketPrice } from "./polymarket";
import type { MarketInfo, Outcome } from "./types";

function race(prices: number[], exclusive = true): MarketInfo {
  const market = buildPolymarketInfo({ negRisk: exclusive, markets: prices.map((price, i) => ({
    groupItemTitle: `Candidate ${i}`,
    outcomes: ["Yes", "No"],
    clobTokenIds: [`${i}-yes`, `${i}-no`],
    outcomePrices: [price, 1 - price],
  })) }, "test");
  assert(market);
  return market;
}

function fresh(market: MarketInfo): Outcome[] {
  return market.outcomes.map((outcome) => ({ ...outcome, priceIsFresh: true, normalizationSafe: true }));
}

test("the highlight starts at raw 98.5%, not a headline rounded to 99%", () => {
  const market = race([0.9849, 0.01]);
  const outcomes = fresh(market);
  assert.equal(getPolymarketPercentages(market, outcomes).percentages.get(outcomes[0].tokenId), 99);
  assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes), null);
  for (const price of [0.985, 0.99, 0.999, 1]) {
    const updated = [{ ...outcomes[0], currentPrice: price }, outcomes[1]];
    assert.equal(getHighConfidenceOutcome(market, updated, updated)?.outcome.tokenId, outcomes[0].tokenId);
  }
});

test("highlight follows assigned colors and clears if the price falls back below 98.5%", () => {
  const market = race([0.995, 0.01]);
  const outcomes = fresh(market);
  assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes, { "0-yes": "red" })?.color, COLORS[3]);
  outcomes[0].currentPrice = 0.9849;
  assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes), null);
});

test("an old retained price does not keep the card highlighted", () => {
  const market = race([0.995, 0.01]);
  const outcomes = fresh(market);
  outcomes[0].priceIsFresh = false;
  assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes), null);
  delete outcomes[0].priceIsFresh;
  assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes), null);
});

test("independent markets and conflicting apparent winners are not treated as decided races", () => {
  const independent = race([0.995, 0.1], false);
  assert.equal(getHighConfidenceOutcome(independent, fresh(independent), fresh(independent)), null);
  const conflicting = race([0.995, 0.995]);
  const outcomes = fresh(conflicting);
  assert.equal(getHighConfidenceOutcome(conflicting, outcomes, outcomes), null);
});

test("the No side of a binary market can determine the background, while Yes remains charted", () => {
  const market = buildPolymarketInfo({ markets: [{
    outcomes: ["Yes", "No"], clobTokenIds: ["yes", "no"], outcomePrices: [0.01, 0.99],
  }] }, "test");
  assert(market);
  const outcomes = fresh(market);
  const highlight = getHighConfidenceOutcome(market, outcomes, outcomes.slice(0, 1), { yes: "blue", no: "red" });
  assert.equal(highlight?.outcome.name, "No");
  assert.equal(highlight?.color, COLORS[3]);
});

test("default highlight colors match the visible chart's palette position", () => {
  const market = race([0.7, 0.2, 0.1]);
  const outcomes = fresh(market);
  outcomes[2].currentPrice = 0.995;
  const chart = [outcomes[0], outcomes[2]];
  assert.equal(getHighConfidenceOutcome(market, outcomes, chart)?.color, COLORS[1]);
});

test("a decided margin bucket uses its party background while the chart keeps palette colors", () => {
  for (const [names, color] of [
    [["Democrat 10-15%", "Democrat 15-20%"], COLORS[1]],
    [["Republican 0-5%", "Republican 5-10%"], COLORS[3]],
    [["Alice (D)", "Bob (D)"], COLORS[1]],
    [["Alice (R)", "Bob (R)"], COLORS[3]],
  ] as const) {
    const market = race([0.995, 0.004]);
    market.outcomes[0].name = names[0];
    market.outcomes[1].name = names[1];
    market.outcomeNames = [...names];
    const outcomes = fresh(market);
    assert.deepEqual(getOutcomeColors(outcomes, undefined, market.outcomeNames), [COLORS[0], COLORS[1]]);
    assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes)?.color, color);
    assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes, { "0-yes": "purple" })?.color, COLORS[4]);
  }
});

test("invalid or absent prices cannot produce a highlight", () => {
  const market = race([0.8, 0.2]);
  for (const value of [NaN, Infinity, -1, 1.1]) {
    const outcomes = fresh(market);
    outcomes[0].currentPrice = value;
    assert.equal(getHighConfidenceOutcome(market, outcomes, outcomes), null);
  }
  assert.equal(getHighConfidenceOutcome(null, [], []), null);
});

test("freshness requires a valid new quote or recent history", () => {
  const now = 10_000;
  assert.equal(hasFreshPolymarketPrice({ price: 0.995, normalizationSafe: false }, [], now), true);
  assert.equal(hasFreshPolymarketPrice(null, [{ t: now - 60, p: 0.995 }], now), true);
  assert.equal(hasFreshPolymarketPrice(null, [{ t: now, p: 0 }], now), true);
  assert.equal(hasFreshPolymarketPrice(null, [{ t: now - 3600, p: 0.995 }], now), false);
  assert.equal(hasFreshPolymarketPrice(null, [], now), false);
});
