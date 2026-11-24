import assert from "node:assert/strict";
import { test } from "node:test";
import { createTradingTimeScale } from "./tradingTime";
import { getStockMarket } from "./stockMarkets";
import { findNearestPricePoint } from "./chartHover";

const ts = (date: string) => Date.parse(date) / 1000;

test("overnight and weekend gaps occupy one candle step, not hours or days of empty space", () => {
  const times = [
    ts("2026-11-20T15:00:00-05:00"), ts("2026-11-20T15:30:00-05:00"),
    ts("2026-11-23T09:30:00-05:00"), ts("2026-11-23T10:00:00-05:00"),
    ts("2026-11-24T09:30:00-05:00"),
  ];
  const scale = createTradingTimeScale(times);
  assert.deepEqual(times.map(scale.toPosition), [0, 0.25, 0.5, 0.75, 1]);
});

test("holidays and DST changes need no hardcoded calendar and retain original timestamps", () => {
  const times = [ts("2026-10-30T15:30:00-04:00"), ts("2026-11-02T09:30:00-05:00"), ts("2026-11-02T10:00:00-05:00")];
  const scale = createTradingTimeScale(times);
  assert.deepEqual(times.map(scale.toPosition), [0, 0.5, 1]);
  const holidayGap = createTradingTimeScale([1000, 1000 + 86400, 1000 + 5 * 86400]);
  assert.deepEqual(holidayGap.timestamps.map(holidayGap.toPosition), [0, 0.5, 1]);
  assert.deepEqual(times.map((_, i) => scale.timestampAtPosition(i / 2)), times);
});

test("scrubbing snaps to a real candle and never invents a weekend date or price", () => {
  const history = [
    { t: ts("2026-11-20T15:30:00-05:00"), p: 100 },
    { t: ts("2026-11-23T09:30:00-05:00"), p: 85 },
    { t: ts("2026-11-23T10:00:00-05:00"), p: 90 },
  ];
  const original = structuredClone(history);
  const scale = createTradingTimeScale(history.map(point => point.t));
  for (let i = 0; i <= 100; i++) {
    const timestamp = scale.timestampAtPosition(i / 100)!;
    assert(history.some(point => point.t === timestamp));
    const point = findNearestPricePoint(history, timestamp)!;
    assert.equal(point.t, timestamp);
    assert.equal(scale.timestampAtPosition(scale.toPosition(timestamp)), timestamp);
  }
  assert.deepEqual(history, original);
  assert.equal(history[1].p - history[0].p, -15);
});

test("daily, weekly and monthly candles stay in order with equal space per observed bar", () => {
  for (const times of [[1, 86401, 345601], [1, 604801, 1814401], [1, 2678401, 7776001]]) {
    const scale = createTradingTimeScale(times);
    assert.deepEqual(times.map(scale.toPosition), [0, 0.5, 1]);
  }
});

test("duplicate, unordered and invalid timestamps are sanitized without mutating input", () => {
  const input = [300, 100, NaN, 100, Infinity, 200];
  const scale = createTradingTimeScale(input);
  assert.deepEqual(scale.timestamps, [100, 200, 300]);
  assert.deepEqual(input, [300, 100, NaN, 100, Infinity, 200]);
  assert.equal(scale.toPosition(150), 0.25);
  assert.equal(scale.toPosition(-100), 0);
  assert.equal(scale.toPosition(500), 1);
  assert.equal(scale.toPosition(NaN), 0.5);
  assert.equal(scale.timestampAtPosition(-1), 100);
  assert.equal(scale.timestampAtPosition(2), 300);
  assert.equal(scale.timestampAtPosition(NaN), null);
});

test("empty and one-candle histories have safe positions", () => {
  const empty = createTradingTimeScale([]);
  assert.equal(empty.timestampAtPosition(0.5), null);
  assert.equal(empty.toPosition(100), 0.5);
  const single = createTradingTimeScale([100]);
  assert.equal(single.toPosition(100), 0.5);
  assert.equal(single.timestampAtPosition(0), 100);
  assert.equal(single.timestampAtPosition(1), 100);
});

test("crypto retains continuous calendar time while stocks, futures and yields can compress closures", () => {
  assert.equal(getStockMarket("builtin:btc")?.continuousTrading, true);
  for (const id of ["builtin:sp500", "builtin:spfut", "builtin:gold", "builtin:oil", "builtin:10y"]) {
    assert.equal(getStockMarket(id)?.continuousTrading, false);
  }
});
