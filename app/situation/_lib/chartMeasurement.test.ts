import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRangeChange, getRangeMeasurements, snapChartTimestamp } from "./chartMeasurement";
import { createTradingTimeScale } from "./tradingTime";
import type { Outcome } from "./types";

const series = (prices: number[], name = "Market"): Outcome => ({ name, tokenId: name, currentPrice: 999, history: prices.map((p, i) => ({ t: 100 + i * 100, p })) });

test("money markets measure relative price change from the selected start, not the live price", () => {
  const outcome = series([100, 110, 120]);
  const [gain] = getRangeMeasurements([outcome], { start: 100, end: 200 }, "price");
  assert.equal(gain.change, 10);
  assert.equal(gain.absoluteChange, 10);
  assert.equal(formatRangeChange(gain), "+10.00%");
  const [loss] = getRangeMeasurements([series([200, 150])], { start: 100, end: 200 }, "price");
  assert.equal(loss.change, -25);
  assert.equal(formatRangeChange(loss), "-25.00%");
});

test("Polymarket ranges use raw percentage points, never relative growth or normalization", () => {
  const outcomes = [series([0.4, 0.57], "Alice"), series([0.7, 0.45], "Bob")];
  const results = getRangeMeasurements(outcomes, { start: 100, end: 200 }, "percent");
  assert.deepEqual(results.map(result => result.change), [17, -25]);
  assert.deepEqual(results.map(formatRangeChange), ["+17.00 pp", "-25.00 pp"]);
});

test("Treasury yields measure basis points rather than relative percentage growth", () => {
  const [result] = getRangeMeasurements([series([4.9, 4.95])], { start: 100, end: 200 }, "yield");
  assert.equal(result.change, 5);
  assert.equal(formatRangeChange(result), "+5.00 bp");
});

test("drag direction and crossing fingers do not reverse the chronological gain or loss", () => {
  const outcome = series([100, 80, 90]);
  assert.deepEqual(getRangeMeasurements([outcome], { start: 100, end: 300 }, "price"),
    getRangeMeasurements([outcome], { start: 300, end: 100 }, "price"));
  assert.equal(getRangeMeasurements([outcome], { start: 100, end: 300 }, "price")[0].change, -10);
});

test("zero and negative money baselines do not fabricate infinite or misleading returns", () => {
  for (const price of [0, -10]) {
    const [result] = getRangeMeasurements([series([price, 100])], { start: 100, end: 200 }, "price");
    assert.equal(result.change, null);
    assert.equal(formatRangeChange(result), "--");
    assert.equal(result.end?.p, 100);
  }
  assert.equal(getRangeMeasurements([series([0, 0.2])], { start: 100, end: 200 }, "percent")[0].change, 20);
});

test("invalid, absent and out-of-range probability samples remain unavailable", () => {
  for (const prices of [[], [NaN, 2], [Infinity, 3]]) {
    const [result] = getRangeMeasurements([series(prices)], { start: 100, end: 200 }, "price");
    assert.equal(result.change, null);
    assert.equal(result.start, null);
  }
  const [badOdds] = getRangeMeasurements([series([0.5, 1.2])], { start: 100, end: 200 }, "percent");
  assert.equal(badOdds.end, null);
  assert.equal(badOdds.change, null);
});

test("range endpoints snap to actual candles, including compressed weekends, without changing history", () => {
  const outcome = series([100, 80, 85]);
  outcome.history[1].t = 100_000;
  outcome.history[2].t = 100_100;
  const original = structuredClone(outcome);
  const scale = createTradingTimeScale(outcome.history.map(point => point.t));
  const start = scale.timestampAtPosition(0)!;
  const end = scale.timestampAtPosition(0.5)!;
  assert.equal(getRangeMeasurements([outcome], { start, end }, "price")[0].change, -20);
  assert.equal(snapChartTimestamp([outcome], 99_999), 100_000);
  assert.equal(snapChartTimestamp([outcome], 50_050), 100);
  assert.equal(snapChartTimestamp([], 100), null);
  assert.deepEqual(outcome, original);
});

test("matching endpoints show zero and small moves keep their direction without negative zero", () => {
  assert.equal(formatRangeChange({ change: -0, unit: "%" }), "0.00%");
  assert.equal(formatRangeChange({ change: -0.001, unit: "pp" }), "-<0.01 pp");
  assert.equal(formatRangeChange({ change: 0.001, unit: "%" }), "+<0.01%");
  assert.equal(formatRangeChange({ change: NaN, unit: "%" }), "--");
  const [result] = getRangeMeasurements([series([1, 2])], { start: 100, end: 100 }, "price");
  assert.equal(result.change, 0);
});
