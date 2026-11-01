import assert from "node:assert/strict";
import { test } from "node:test";
import { findNearestPricePoint, formatHistoricalPercentage, getHistoricalPrices } from "./chartHover";
import type { Outcome } from "./types";

test("historical readouts select the same nearest point as the chart marker, with earlier ties", () => {
  const history = [{ t: 100, p: 0.625 }, { t: 200, p: 0.7 }, { t: 300, p: 0.8 }];
  assert.equal(findNearestPricePoint(history, 10), history[0]);
  assert.equal(findNearestPricePoint(history, 150), history[0]);
  assert.equal(findNearestPricePoint(history, 151), history[1]);
  assert.equal(findNearestPricePoint(history, 999), history[2]);
  assert.equal(findNearestPricePoint([], 150), null);
  assert.equal(findNearestPricePoint(history, NaN), null);
});

test("scrubbing returns token-specific raw prices without modifying live quotes, ordering or normalization flags", () => {
  const outcomes: Outcome[] = [
    { name: "A", tokenId: "a", currentPrice: 0.7, normalizationSafe: true, priceIsFresh: true, history: [{ t: 100, p: 0.625 }] },
    { name: "B", tokenId: "b", currentPrice: 0.3, normalizationSafe: true, priceIsFresh: true, history: [{ t: 100, p: 0.4 }] },
  ];
  const before = structuredClone(outcomes);
  const prices = getHistoricalPrices(outcomes, 100);
  assert.deepEqual(prices, { a: 0.625, b: 0.4 });
  assert.equal(formatHistoricalPercentage(prices.a), "62.5%");
  assert.equal(formatHistoricalPercentage(prices.b), "40%");
  assert.deepEqual(outcomes, before);
});

test("missing or invalid historical values stay unavailable rather than falling back to a live price", () => {
  const outcomes: Outcome[] = [
    { name: "A", tokenId: "a", currentPrice: 0.7, history: [] },
    { name: "B", tokenId: "b", currentPrice: 0.3, history: [{ t: 100, p: NaN }] },
  ];
  assert.deepEqual(getHistoricalPrices(outcomes, 100), { a: null, b: null });
  for (const price of [null, undefined, NaN, -1, 2]) assert.equal(formatHistoricalPercentage(price), "--");
});

test("historical readouts preserve precise probabilities and support stock and yield prices", () => {
  assert.equal(formatHistoricalPercentage(0), "0%");
  assert.equal(formatHistoricalPercentage(1), "100%");
  assert.equal(formatHistoricalPercentage(0.005), "0.5%");
  const outcomes: Outcome[] = [{ name: "Stock", tokenId: "stock", currentPrice: 140000, history: [{ t: 100, p: 129999.13 }] },
    { name: "Yield", tokenId: "yield", currentPrice: 4, history: [{ t: 100, p: 3.82 }] }];
  assert.deepEqual(getHistoricalPrices(outcomes, 100), { stock: 129999.13, yield: 3.82 });
});
