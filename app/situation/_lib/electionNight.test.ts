import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPriceHistory, fetchStockData } from "./api";
import { getFidelity, getStartTs, getYahooParams, TIME_RANGES } from "./constants";
import { ELECTION_DAY_START_TS, ELECTION_NIGHT_LABEL, ELECTION_NIGHT_START_TS, isElectionNightAvailable } from "./electionNight";
import { createChartHistoryCache } from "./chartHistory";
import { loadLocalState, saveTimeRange } from "./storage";

test("Election Night starts at 6pm Eastern on November 3, using the post-DST offset", () => {
  assert.equal(new Date(ELECTION_NIGHT_START_TS * 1000).toISOString(), "2026-11-03T23:00:00.000Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hour12: false,
  }).formatToParts(new Date(ELECTION_NIGHT_START_TS * 1000));
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  assert.equal(value("year"), "2026");
  assert.equal(value("month"), "11");
  assert.equal(value("day"), "3");
  assert.equal(value("hour"), "18");
});

test("the fixed start never moves across midnight or the following day", () => {
  for (const date of ["2026-11-03T18:01:00-05:00", "2026-11-03T23:59:00-05:00", "2026-11-04T00:01:00-05:00", "2026-11-04T12:00:00-05:00"])
    assert.equal(getStartTs(ELECTION_NIGHT_LABEL, Date.parse(date)), ELECTION_NIGHT_START_TS);
  const now = Date.parse("2026-11-04T00:01:00-05:00");
  assert.equal(getStartTs("1H", now), now / 1000 - 3600);
});

test("the toggle becomes available at 7am Eastern and leaves rolling ranges unchanged", () => {
  assert.equal(new Date(ELECTION_DAY_START_TS * 1000).toISOString(), "2026-11-03T12:00:00.000Z");
  assert.equal(isElectionNightAvailable(ELECTION_DAY_START_TS * 1000 - 1), false);
  assert.equal(isElectionNightAvailable(ELECTION_DAY_START_TS * 1000), true);
  assert.equal(isElectionNightAvailable(ELECTION_NIGHT_START_TS * 1000 + 86400_000), true);
  assert.equal(TIME_RANGES.map((range) => String(range.label)).includes(ELECTION_NIGHT_LABEL), false);
  assert.equal(getFidelity(ELECTION_NIGHT_LABEL), 1);
  assert.deepEqual(getYahooParams(ELECTION_NIGHT_LABEL), { range: "5d", interval: "5m" });
});

test("the daytime 7am anchor switches to 6pm exactly at the evening boundary", () => {
  for (const date of ["2026-11-03T07:00:00-05:00", "2026-11-03T12:00:00-05:00", "2026-11-03T17:59:59.999-05:00"])
    assert.equal(getStartTs(ELECTION_NIGHT_LABEL, Date.parse(date)), ELECTION_DAY_START_TS);
  assert.equal(getStartTs(ELECTION_NIGHT_LABEL, ELECTION_NIGHT_START_TS * 1000), ELECTION_NIGHT_START_TS);
});

test("Polymarket requests use 7am during the day and retain 6pm past midnight", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const end of [ELECTION_DAY_START_TS + 3600, ELECTION_NIGHT_START_TS + 4 * 3600, ELECTION_NIGHT_START_TS + 7 * 3600]) {
      const start = getStartTs(ELECTION_NIGHT_LABEL, end * 1000);
      globalThis.fetch = async (input) => {
        const url = new URL(String(input), "http://localhost");
        assert.equal(Number(url.searchParams.get("startTs")), start);
        assert.equal(Number(url.searchParams.get("endTs")), end);
        assert.equal(url.searchParams.get("fidelity"), "1");
        return Response.json({ history: [
          { t: start - 60, p: 0.4 },
          { t: start + 60, p: 0.5 },
          { t: end + 60, p: 0.6 },
        ] });
      };
      assert.deepEqual(await fetchPriceHistory("token", getStartTs(ELECTION_NIGHT_LABEL, end * 1000), end, 1), [
        { t: start + 60, p: 0.5 },
      ]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an open chart drops daytime cached history on its first evening refresh, even within the cache cooldown", async () => {
  let now = ELECTION_NIGHT_START_TS - 12;
  const starts: number[] = [];
  const cache = createChartHistoryCache(async (_token, start) => {
    starts.push(start);
    return [{ t: start, p: 0.4 }, { t: now, p: 0.5 }];
  }, () => now * 1000);
  const daytime = await cache.get("token", ELECTION_NIGHT_LABEL, getStartTs(ELECTION_NIGHT_LABEL, now * 1000), now, 1);
  assert.equal(daytime[0].t, ELECTION_DAY_START_TS);
  now += 12;
  const evening = await cache.get("token", ELECTION_NIGHT_LABEL, getStartTs(ELECTION_NIGHT_LABEL, now * 1000), now, 1);
  assert.deepEqual(evening, []);
  cache.sample("token", ELECTION_NIGHT_LABEL, evening, { t: now, p: 0.6 });
  now += 60;
  const refreshed = await cache.get("token", ELECTION_NIGHT_LABEL, getStartTs(ELECTION_NIGHT_LABEL, now * 1000), now, 1);
  assert(refreshed.every((point) => point.t >= ELECTION_NIGHT_START_TS));
  assert.deepEqual(starts, [ELECTION_DAY_START_TS, ELECTION_NIGHT_START_TS]);
});

test("stock histories trim to the anchor, and closed stocks can keep polling with no post-6pm points", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ chart: { result: [{
      timestamp: [ELECTION_NIGHT_START_TS - 3600, ELECTION_NIGHT_START_TS + 60],
      indicators: { quote: [{ close: [100, 101] }] }, meta: { regularMarketPrice: 101, previousClose: 99 },
    }] } });
    const snapshot = await fetchStockData("TEST", "5d", "5m", ELECTION_NIGHT_START_TS, true, true);
    assert.deepEqual(snapshot?.history, [{ t: ELECTION_NIGHT_START_TS + 60, p: 101 }]);
    globalThis.fetch = async () => Response.json({ chart: { result: [{
      timestamp: [ELECTION_NIGHT_START_TS - 3600],
      indicators: { quote: [{ close: [100] }] }, meta: { regularMarketPrice: 100, previousClose: 99 },
    }] } });
    const waiting = await fetchStockData("TEST", "5d", "5m", ELECTION_NIGHT_START_TS, false, true);
    assert.deepEqual(waiting?.history, []);
    assert.equal(waiting?.currentPrice, 100);
    assert.equal(await fetchStockData("TEST", "5d", "5m", ELECTION_NIGHT_START_TS), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Election Night persists as a shared time range for all layouts and cannot restore prematurely", () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>([["situation-timerange", "1D"]]);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
  try {
    saveTimeRange(ELECTION_NIGHT_LABEL);
    assert.equal(loadLocalState(ELECTION_DAY_START_TS * 1000 - 1).timeRange, "1D");
    for (const layout of ["1", "2", "2x2", "3x2", "4x2", "7x4"]) {
      data.set("situation-layout", layout);
      assert.equal(loadLocalState(ELECTION_DAY_START_TS * 1000).timeRange, ELECTION_NIGHT_LABEL);
    }
    saveTimeRange("1W");
    assert.equal(loadLocalState(ELECTION_NIGHT_START_TS * 1000 + 86400_000).timeRange, "1W");
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
