import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPriceHistory, fetchStockData } from "./api";
import { getFidelity, getStartTs, getYahooParams, TIME_RANGES } from "./constants";
import { ELECTION_NIGHT_LABEL, ELECTION_NIGHT_START_TS, isElectionNightAvailable } from "./electionNight";
import { loadLocalState, loadTVElectionNight, saveTVElectionNight } from "./storage";

test("Election Night starts at 7pm Eastern on November 3, using the post-DST offset", () => {
  assert.equal(new Date(ELECTION_NIGHT_START_TS * 1000).toISOString(), "2026-11-04T00:00:00.000Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hour12: false,
  }).formatToParts(new Date(ELECTION_NIGHT_START_TS * 1000));
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  assert.equal(value("year"), "2026");
  assert.equal(value("month"), "11");
  assert.equal(value("day"), "3");
  assert.equal(value("hour"), "19");
});

test("the fixed start never moves across midnight or the following day", () => {
  for (const date of ["2026-11-03T19:01:00-05:00", "2026-11-03T23:59:00-05:00", "2026-11-04T00:01:00-05:00", "2026-11-04T12:00:00-05:00"])
    assert.equal(getStartTs(ELECTION_NIGHT_LABEL, Date.parse(date)), ELECTION_NIGHT_START_TS);
  const now = Date.parse("2026-11-04T00:01:00-05:00");
  assert.equal(getStartTs("1H", now), now / 1000 - 3600);
});

test("the toggle is available only after its fixed start and is absent from regular ranges", () => {
  assert.equal(isElectionNightAvailable(ELECTION_NIGHT_START_TS * 1000 - 1), false);
  assert.equal(isElectionNightAvailable(ELECTION_NIGHT_START_TS * 1000), true);
  assert.equal(isElectionNightAvailable(ELECTION_NIGHT_START_TS * 1000 + 86400_000), true);
  assert.equal(TIME_RANGES.map((range) => String(range.label)).includes(ELECTION_NIGHT_LABEL), false);
  assert.equal(getFidelity(ELECTION_NIGHT_LABEL), 1);
  assert.deepEqual(getYahooParams(ELECTION_NIGHT_LABEL), { range: "5d", interval: "5m" });
});

test("Polymarket requests retain the 7pm start as their end time advances past midnight", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const end of [ELECTION_NIGHT_START_TS + 4 * 3600, ELECTION_NIGHT_START_TS + 6 * 3600]) {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input), "http://localhost");
        assert.equal(Number(url.searchParams.get("startTs")), ELECTION_NIGHT_START_TS);
        assert.equal(Number(url.searchParams.get("endTs")), end);
        assert.equal(url.searchParams.get("fidelity"), "1");
        return Response.json({ history: [
          { t: ELECTION_NIGHT_START_TS - 60, p: 0.4 },
          { t: ELECTION_NIGHT_START_TS + 60, p: 0.5 },
          { t: end + 60, p: 0.6 },
        ] });
      };
      assert.deepEqual(await fetchPriceHistory("token", getStartTs(ELECTION_NIGHT_LABEL, end * 1000), end, 1), [
        { t: ELECTION_NIGHT_START_TS + 60, p: 0.5 },
      ]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stock histories trim to the anchor, and closed stocks can keep polling with no post-7pm points", async () => {
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

test("the TV selection persists separately and cannot restore prematurely", () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>([["situation-timerange", "1D"]]);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
  try {
    saveTVElectionNight(true);
    assert.equal(loadTVElectionNight(ELECTION_NIGHT_START_TS * 1000 - 1), false);
    assert.equal(loadTVElectionNight(ELECTION_NIGHT_START_TS * 1000), true);
    assert.equal(loadLocalState().timeRange, "1D");
    saveTVElectionNight(false);
    assert.equal(loadTVElectionNight(ELECTION_NIGHT_START_TS * 1000 + 86400_000), false);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
