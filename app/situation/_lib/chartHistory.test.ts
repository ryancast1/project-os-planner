import assert from "node:assert/strict";
import { test } from "node:test";
import { createChartHistoryCache, mergeChartHistory } from "./chartHistory";
import type { PricePoint } from "./types";

test("history loads once, then refreshes only a recent overlapping window once a minute", async () => {
  let now = 1_000_000;
  const calls: number[][] = [];
  const cache = createChartHistoryCache(async (_token, start, end, fidelity) => {
    calls.push([start, end, fidelity]);
    return [{ t: start, p: 0.4 }, { t: end, p: 0.6 }];
  }, () => now * 1000);
  await cache.get("a", "1W", now - 7 * 86400, now, 30);
  for (let i = 0; i < 4; i++) {
    now += 12;
    await cache.get("a", "1W", now - 7 * 86400, now, 30);
  }
  assert.equal(calls.length, 1);
  now += 12;
  const history = await cache.get("a", "1W", now - 7 * 86400, now, 30);
  assert.deepEqual(calls[1], [1_000_000 - 120, now, 1]);
  assert(history.some((point) => point.t === 1_000_000));
});

test("time ranges and tokens have separate coverage, preserving wider range loads", async () => {
  let now = 1_000_000;
  const calls: string[] = [];
  const cache = createChartHistoryCache(async (token, start) => {
    calls.push(token);
    return [{ t: start, p: 0.5 }];
  }, () => now * 1000);
  await cache.get("a", "1W", 900_000, now, 30);
  const month = await cache.get("a", "1M", 100_000, now, 60);
  assert.equal(month[0].t, 100_000);
  await cache.get("b", "1M", 100_000, now, 60);
  now += 12;
  await cache.get("a", "1W", 900_000, now, 30);
  assert.deepEqual(calls, ["a", "a", "b"]);
});

test("duplicate cards share in-flight history and preserve full history beyond a month", async () => {
  let calls = 0;
  const cache = createChartHistoryCache(async () => {
    calls++;
    return [{ t: 1, p: 0.1 }, { t: 10_000_000, p: 0.8 }];
  });
  const [a, b] = await Promise.all([cache.get("a", "All", 0, 10_000_000, 720), cache.get("a", "All", 0, 10_000_000, 720)]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(a[0].t, 1);
});

test("empty initial ranges fall back to all history and trim without repeated full downloads", async () => {
  let calls = 0;
  const cache = createChartHistoryCache(async (_token, start) => {
    calls++;
    return start === 0 ? [{ t: 1, p: 0.1 }, { t: 900, p: 0.5 }] : [];
  });
  assert.deepEqual(await cache.get("a", "1H", 800, 1000, 1), [{ t: 900, p: 0.5 }]);
  await cache.get("a", "1H", 800, 1000, 1);
  assert.equal(calls, 2);
});

test("failed incremental refreshes retain history and retry from the last successful coverage", async () => {
  let now = 1000;
  const calls: number[] = [];
  const cache = createChartHistoryCache(async (_token, start): Promise<PricePoint[] | null> => {
    calls.push(start);
    return calls.length === 2 ? null : [{ t: now, p: 0.5 }];
  }, () => now * 1000);
  await cache.get("a", "1H", 0, now, 1);
  now += 60;
  assert.deepEqual(await cache.get("a", "1H", 0, now, 1), [{ t: 1000, p: 0.5 }]);
  now += 60;
  await cache.get("a", "1H", 0, now, 1);
  assert.deepEqual(calls, [0, 880, 880]);
});

test("live quotes move the chart between history fetches with at most one tip per minute", async () => {
  let now = 1000;
  let calls = 0;
  const cache = createChartHistoryCache(async () => { calls++; return [{ t: 900, p: 0.5 }]; }, () => now * 1000);
  for (let i = 0; i < 4; i++) {
    const history = await cache.get("a", "1H", 800, now, 1);
    cache.sample("a", "1H", history, { t: now, p: 0.6 + i * 0.01 });
    now += 12;
  }
  const history = await cache.get("a", "1H", 800, now, 1);
  assert.equal(calls, 1);
  assert(history.length <= 3);
  assert.equal(history.at(-1)?.p, 0.63);
});

test("empty incremental responses retain the catch-up window instead of skipping missing history", async () => {
  let now = 1000;
  const starts: number[] = [];
  const cache = createChartHistoryCache(async (_token, start) => {
    starts.push(start);
    return starts.length === 1 ? [{ t: now, p: 0.5 }] : [];
  }, () => now * 1000);
  await cache.get("a", "1H", 0, now, 1);
  now += 60;
  await cache.get("a", "1H", 0, now, 1);
  now += 60;
  await cache.get("a", "1H", 0, now, 1);
  assert.deepEqual(starts, [0, 880, 880]);
});

test("history merging orders and deduplicates points and rejects future or invalid values", () => {
  assert.deepEqual(mergeChartHistory([{ t: 10, p: 0.5 }, { t: 20, p: 0.4 }], [{ t: 10, p: 0.6 }, { t: 30, p: 2 }, { t: 40, p: 0.4 }], 10, 30), [{ t: 10, p: 0.6 }, { t: 20, p: 0.4 }]);
});

test("old preset caches expire and bounded cache storage can be refetched safely", async () => {
  let now = 1000;
  let calls = 0;
  const cache = createChartHistoryCache(async () => { calls++; return [{ t: now, p: 0.5 }]; }, () => now * 1000, 2);
  for (const token of ["a", "b", "c", "a"]) await cache.get(token, "All", 0, now, 720);
  assert.equal(calls, 4);
  now += 16 * 86400;
  await cache.get("a", "All", 0, now, 720);
  assert.equal(calls, 5);
});
