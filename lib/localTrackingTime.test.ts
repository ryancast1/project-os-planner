import assert from "node:assert/strict";
import { test } from "node:test";
import { localTrackingTime, TRICH_DAY_START_HOUR, trichLogFields, VICE_DAY_START_HOUR, viceLogFields } from "./localTrackingTime";

test("Romanian morning pulls belong to the local day even while New York is on the prior day", () => {
  const time = localTrackingTime(TRICH_DAY_START_HOUR, new Date("2026-11-15T06:00:00+02:00"), "Europe/Bucharest");
  assert.equal(time.localDate, "2026-11-15");
  assert.equal(time.localTime, "06:00:00");
  assert.equal(time.trackingDate, "2026-11-15");
  assert.equal(time.timestamp, "2026-11-15T04:00:00.000Z");
});

test("time-of-day comparisons use the same clock hour in different zones", () => {
  const romania = localTrackingTime(3, new Date("2026-11-15T13:00:00+02:00"), "Europe/Bucharest");
  const newYork = localTrackingTime(3, new Date("2026-11-15T13:00:00-05:00"), "America/New_York");
  assert.equal(romania.localTime, newYork.localTime);
  assert.notEqual(romania.timestamp, newYork.timestamp);
});

test("Trich and Vices retain their distinct local cutoffs", () => {
  for (const [zone, offset] of [["Europe/Bucharest", "+02:00"], ["America/New_York", "-05:00"]]) {
    for (const cutoff of [TRICH_DAY_START_HOUR, VICE_DAY_START_HOUR]) {
      const before = new Date(`2026-11-15T0${cutoff - 1}:59:59${offset}`);
      const at = new Date(`2026-11-15T0${cutoff}:00:00${offset}`);
      assert.equal(localTrackingTime(cutoff, before, zone).trackingDate, "2026-11-14");
      assert.equal(localTrackingTime(cutoff, at, zone).trackingDate, "2026-11-15");
    }
  }
});

test("cutoffs follow wall time across daylight-saving transitions", () => {
  for (const instant of ["2026-03-08T01:59:59-05:00", "2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"]) {
    const time = localTrackingTime(3, new Date(instant), "America/New_York");
    assert.equal(time.trackingDate, instant.startsWith("2026-03") ? "2026-03-07" : "2026-10-31");
  }
  assert.equal(localTrackingTime(3, new Date("2026-03-08T03:00:00-04:00"), "America/New_York").trackingDate, "2026-03-08");
  assert.equal(localTrackingTime(4, new Date("2026-10-25T04:00:00+02:00"), "Europe/Bucharest").trackingDate, "2026-10-25");
});

test("logging rereads the device timezone and preserves previously captured fields", () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = "Europe/Bucharest";
    const instant = new Date("2026-11-15T04:00:00Z");
    const pull = trichLogFields(instant);
    const hit = viceLogFields(instant);
    assert.equal(pull.local_time, "06:00:00");
    assert.equal(pull.time_zone, "Europe/Bucharest");
    assert.equal(hit.occurred_on, "2026-11-15");
    assert.equal(hit.occurred_at, "06:00:00");

    process.env.TZ = "America/New_York";
    const nextPull = trichLogFields(instant);
    assert.equal(nextPull.local_time, "23:00:00");
    assert.equal(nextPull.occurred_on, "2026-11-14");
    assert.equal(pull.local_time, "06:00:00");
    assert.equal(pull.occurred_on, "2026-11-15");
    assert.equal(hit.time_zone, "Europe/Bucharest");
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("midnight cutoffs cross month and year boundaries without using UTC day buckets", () => {
  assert.equal(localTrackingTime(3, new Date("2027-01-01T02:30:00+14:00"), "Pacific/Kiritimati").trackingDate, "2026-12-31");
  assert.equal(localTrackingTime(4, new Date("2026-12-01T03:30:00+02:00"), "Europe/Bucharest").trackingDate, "2026-11-30");
});
