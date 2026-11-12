import assert from "node:assert/strict";
import { test } from "node:test";
import { getFidelity, getStartTs, getYahooParams, TIME_RANGES } from "./constants";

test("only everyday rolling time ranges remain available", () => {
  assert.deepEqual(TIME_RANGES.map((range) => range.label), ["1H", "4H", "1D", "1W", "1M", "3M", "1Y", "5Y", "All"]);
  for (const now of [Date.parse("2026-11-05T12:00:00-05:00"), Date.parse("2026-11-06T00:01:00-05:00")]) {
    for (const range of TIME_RANGES) {
      assert.equal(getStartTs(range.label, now), range.seconds === 0 ? 0 : Math.floor(now / 1000) - range.seconds);
      assert(getFidelity(range.label) > 0);
      assert(getYahooParams(range.label).range);
      assert(getYahooParams(range.label).interval);
    }
  }
});
