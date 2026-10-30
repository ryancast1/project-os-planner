import assert from "node:assert/strict";
import { test } from "node:test";
import type { MarketInfo, Outcome } from "./types";
import { fetchPrice } from "./api";
import { formatPolymarketPercentage, getPolymarketPercentages, getVisiblePolymarketOutcomes } from "./outcomes";
import { buildPolymarketInfo, getCurrentPolymarketPrice, getPolymarketQuote, parseProbability } from "./polymarket";

function subMarket(id: string, price: number) {
  return {
    question: `Will ${id} win?`,
    groupItemTitle: id,
    outcomes: '["Yes", "No"]',
    clobTokenIds: JSON.stringify([`${id}-yes`, `${id}-no`]),
    outcomePrices: JSON.stringify([String(price), String(1 - price)]),
  };
}

function exclusive(prices: number[]): MarketInfo {
  const market = buildPolymarketInfo({ negRisk: true, markets: prices.map((price, i) => subMarket(String(i), price)) }, "test");
  assert(market);
  return market;
}

function fresh(market: MarketInfo): Outcome[] {
  return market.outcomes.map((outcome) => ({ ...outcome, normalizationSafe: true }));
}

function values(market: MarketInfo, outcomes = fresh(market)) {
  return [...getPolymarketPercentages(market, outcomes).percentages.values()];
}

test("complete exclusive choices receive only a small correction", () => {
  const market = exclusive([0.57, 0.45]);
  assert.equal(getPolymarketPercentages(market, fresh(market)).normalized, true);
  assert.deepEqual(values(market), [56, 44]);
});

test("Yes/No uses the Yes token even if Gamma lists No first", () => {
  const market = buildPolymarketInfo({ markets: [{
    outcomes: '["no", "YES"]',
    clobTokenIds: '["no-token", "yes-token"]',
    outcomePrices: '["0.39", "0.63"]',
  }] }, "test");
  assert(market);
  assert.equal(market.kind, "binary");
  assert.equal(market.outcomes[0].tokenId, "yes-token");
  assert.deepEqual(values(market), [63, 39]);
  assert.equal(getPolymarketPercentages(market, fresh(market)).normalized, false);
});

test("near-zero binary Yes is retained", () => {
  const market = buildPolymarketInfo({ markets: [subMarket("unlikely", 0.001)] }, "test");
  assert(market);
  assert.equal(market.kind, "binary");
  assert.equal(market.outcomes[0].currentPrice, 0.001);
});

test("native named alternatives keep their names and can normalize", () => {
  const market = buildPolymarketInfo({ markets: [{
    outcomes: ["Alice", "Bob"], clobTokenIds: ["alice", "bob"], outcomePrices: [0.57, 0.45],
  }] }, "test");
  assert(market);
  assert.equal(market.kind, "multi");
  assert.deepEqual(market.outcomes.map((o) => o.name), ["Alice", "Bob"]);
  assert.deepEqual(values(market), [56, 44]);
});

test("independent choices are never forced to 100 even when already near 100", () => {
  const market = buildPolymarketInfo({ markets: [subMarket("a", 0.57), subMarket("b", 0.45)] }, "test");
  assert(market);
  assert.equal(market.normalizationEligible, false);
  assert.deepEqual(values(market), [57, 45]);
});

test("omitting a low-price tail disables normalization", () => {
  const market = exclusive([0.55, 0.44, 0.004]);
  assert.equal(market.outcomes.length, 2);
  assert.equal(market.outcomeNames?.length, 3);
  assert.equal(market.normalizationEligible, false);
  assert.deepEqual(values(market), [55, 44]);
});

test("omitting a closed or malformed choice disables normalization", () => {
  for (const extra of [{ ...subMarket("closed", 0.01), closed: true }, { ...subMarket("bad", 0.01), clobTokenIds: "invalid-json" }]) {
    const market = buildPolymarketInfo({ negRisk: true, markets: [subMarket("a", 0.55), subMarket("b", 0.44), extra] }, "test");
    assert(market);
    assert.equal(market.normalizationEligible, false);
    assert.deepEqual(values(market), [55, 44]);
  }
});

test("one remaining candidate stays a multi-choice market with its actual price", () => {
  const market = exclusive([0.63, 0.004]);
  assert.equal(market.kind, "multi");
  assert.equal(market.outcomes.length, 1);
  assert.equal(market.outcomes[0].name, "0");
  assert.deepEqual(values(market), [63]);
});

test("augmented events with potential unnamed choices use raw prices", () => {
  const market = buildPolymarketInfo({ negRisk: true, negRiskAugmented: true, markets: [subMarket("a", 0.57), subMarket("b", 0.45)] }, "test");
  assert(market);
  assert.equal(market.normalizationEligible, false);
  assert.deepEqual(values(market), [57, 45]);
});

test("inactive slots are excluded by metadata regardless of their names or prices", () => {
  const market = buildPolymarketInfo({
    negRisk: true,
    negRiskAugmented: true,
    markets: [
      { ...subMarket("Alice", 0.78), active: true },
      { ...subMarket("Bob", 0.22), active: true },
      { ...subMarket("Candidate A", 0.5), active: false },
      { ...subMarket("Person A", 0.5), active: false },
      { ...subMarket("Other", 0.5), active: false },
      { ...subMarket("Unrelated label", 0.92), active: false },
    ],
  }, "test");
  assert(market);
  assert.deepEqual(market.outcomes.map((outcome) => outcome.name), ["Alice", "Bob"]);
  assert.equal(market.normalizationEligible, true);
  assert.deepEqual(values(market), [78, 22]);
});

test("confirmed active choices round to 100 rather than 101 after excluding inactive slots", () => {
  const market = buildPolymarketInfo({
    negRisk: true,
    negRiskAugmented: true,
    markets: [
      { ...subMarket("Alice", 0.735), active: true },
      { ...subMarket("Bob", 0.265), active: true },
      { ...subMarket("Future slot", 0.5), active: false },
    ],
  }, "test");
  assert(market);
  assert.equal(getPolymarketPercentages(market, fresh(market)).normalized, true);
  assert.deepEqual(values(market), [74, 26]);
});

test("a legitimate active Other outcome is preserved", () => {
  const market = buildPolymarketInfo({
    negRisk: true,
    negRiskAugmented: true,
    markets: [
      { ...subMarket("Alice", 0.7), active: true },
      { ...subMarket("Bob", 0.24), active: true },
      { ...subMarket("Other", 0.06), active: true },
    ],
  }, "test");
  assert(market);
  assert.equal(market.outcomes.length, 3);
  assert(market.outcomes.some((outcome) => outcome.name === "Other"));
  assert.equal(market.normalizationEligible, true);
});

test("inactive slots do not excuse omitting a real low-price active choice", () => {
  const market = buildPolymarketInfo({
    negRisk: true,
    negRiskAugmented: true,
    markets: [
      { ...subMarket("Alice", 0.55), active: true },
      { ...subMarket("Bob", 0.44), active: true },
      { ...subMarket("Active longshot", 0.004), active: true },
      { ...subMarket("Inactive slot", 0.5), active: false },
    ],
  }, "test");
  assert(market);
  assert.equal(market.normalizationEligible, false);
  assert.deepEqual(values(market), [55, 44]);
});

test("a single inactive market is not presented as a live binary", () => {
  assert.equal(buildPolymarketInfo({ markets: [{ ...subMarket("Inactive", 0.5), active: false }] }, "test"), null);
});

test("large totals and excessive individual adjustments use raw prices", () => {
  for (const prices of [[0.8, 0.4], [0.4, 0.3], [0.94, 0.02]]) {
    const market = exclusive(prices);
    assert.equal(getPolymarketPercentages(market, fresh(market)).normalized, false);
    assert.deepEqual(values(market), prices.map((price) => Math.round(price * 100)));
  }
});

test("failed or wide-spread quotes disable normalization for the entire event", () => {
  const market = exclusive([0.57, 0.45]);
  const outcomes = fresh(market);
  outcomes[1].normalizationSafe = false;
  assert.equal(getPolymarketPercentages(market, outcomes).normalized, false);
  assert.deepEqual(values(market, outcomes), [57, 45]);
});

test("a visible subset is never normalized independently", () => {
  const market = exclusive([0.48, 0.48, 0.03]);
  const subset = fresh(market).slice(0, 2);
  assert.equal(getPolymarketPercentages(market, subset).normalized, false);
  assert.deepEqual(values(market, subset), [48, 48]);
});

test("many choices round fairly to 100 without making the leader negative", () => {
  const market = exclusive(Array.from({ length: 60 }, () => 1 / 60));
  const result = getPolymarketPercentages(market, fresh(market));
  assert.equal(result.normalized, true);
  const percentages = [...result.percentages.values()] as number[];
  assert.equal(percentages.reduce((sum, value) => sum + value, 0), 100);
  assert(percentages.every((value) => value === 1 || value === 2));
});

test("invalid and unavailable prices show unavailable rather than NaN or a fabricated zero", () => {
  const market = exclusive([0.57, 0.45]);
  for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
    const outcomes = fresh(market);
    outcomes[0].currentPrice = invalid;
    const result = getPolymarketPercentages(market, outcomes);
    assert.equal(result.normalized, false);
    assert.equal(formatPolymarketPercentage(result.percentages.get(outcomes[0].tokenId)), "--");
    assert.equal(result.percentages.get(outcomes[1].tokenId), 45);
  }
});

test("compact 5% cutoff uses raw prices regardless of the event's total", () => {
  const market = exclusive([0.92, 0.5, 0.06]);
  assert.equal(getVisiblePolymarketOutcomes(market.outcomes, true).length, 3);
  const low = exclusive([0.75, 0.045]);
  assert.equal(getVisiblePolymarketOutcomes(low.outcomes, true).length, 1);
});

test("midpoint uses the actual best prices, independent of book order and zero-size levels", () => {
  const quote = getPolymarketQuote({
    bids: [{price:"0.99",size:"0"},{price:"0.10",size:"1"},{price:"0.54",size:"2"}],
    asks: [{price:"0.90",size:"1"},{price:"0.56",size:"2"}],
  });
  assert(quote);
  assert.equal(quote.price, 0.55);
  assert.equal(quote.normalizationSafe, true);
});

test("wide spreads use the token's last trade, never the book's other-token last trade", () => {
  const book = { bids:[{price:"0.10",size:"1"}], asks:[{price:"0.90",size:"1"}], last_trade_price:"0.80" };
  assert.equal(getPolymarketQuote(book), null);
  assert.deepEqual(getPolymarketQuote(book, "0.30"), {price:0.3, normalizationSafe:false});
});

test("one-sided and crossed books cannot produce a trustworthy midpoint", () => {
  assert.equal(getPolymarketQuote({ bids:[{price:"0.60",size:"1"}] }), null);
  assert.deepEqual(getPolymarketQuote({ asks:[{price:"0.60",size:"1"}] }, "0.40"), {price:0.4,normalizationSafe:false});
  assert.equal(getPolymarketQuote({ bids:[{price:"0.70",size:"1"}], asks:[{price:"0.60",size:"1"}] }), null);
});

test("exactly ten-cent spreads still use midpoint", () => {
  assert.deepEqual(getPolymarketQuote({ bids:[{price:"0.50",size:"1"}], asks:[{price:"0.60",size:"1"}] }), {price:0.55,normalizationSafe:true});
});

test("quote failures fall back to recent history, then the previous genuine price", () => {
  const now = 10_000;
  assert.equal(getCurrentPolymarketPrice({price:0.61, normalizationSafe:true}, [{t:now,p:0.6}], 0.58, now), 0.61);
  assert.equal(getCurrentPolymarketPrice(null, [{t:now-60,p:0.6}], 0.58, now), 0.6);
  assert.equal(getCurrentPolymarketPrice(null, [{t:now-3600,p:0.2}], 0.58, now), 0.58);
  assert.equal(getCurrentPolymarketPrice(null, [{t:now+60,p:0.2}], 0.58, now), 0.58);
  assert.equal(getCurrentPolymarketPrice(null, [], 0.58, now), 0.58);
});

test("probability parser accepts zero and one but rejects malformed values", () => {
  for (const value of [0,1,"0","1","0.55"]) assert.equal(parseProbability(value), Number(value));
  for (const value of [null,undefined,true,false,""," ","NaN","0.55oops",NaN,Infinity,-1,2]) assert.equal(parseProbability(value), null);
});

test("price client validates quotes and defaults unknown quote quality to raw", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({price:"0.55",normalizationSafe:true});
    assert.deepEqual(await fetchPrice("token"), {price:0.55,normalizationSafe:true});
    globalThis.fetch = async () => Response.json({price:"0.55"});
    assert.deepEqual(await fetchPrice("token"), {price:0.55,normalizationSafe:false});
    globalThis.fetch = async () => Response.json({price:"invalid"});
    assert.equal(await fetchPrice("token"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
