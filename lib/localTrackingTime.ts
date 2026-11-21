export const TRICH_DAY_START_HOUR = 3;
export const VICE_DAY_START_HOUR = 4;

export function localTrackingTime(cutoffHour: number, now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  const localTime = `${part("hour")}:${part("minute")}:${part("second")}`;
  const day = new Date(`${localDate}T12:00:00Z`);
  if (Number(part("hour")) < cutoffHour) day.setUTCDate(day.getUTCDate() - 1);
  return {
    localDate,
    localTime,
    timeZone,
    trackingDate: day.toISOString().slice(0, 10),
    timestamp: now.toISOString(),
  };
}

export function trichLogFields(now = new Date()) {
  const time = localTrackingTime(TRICH_DAY_START_HOUR, now);
  return {
    occurred_on: time.trackingDate,
    local_date: time.localDate,
    local_time: time.localTime,
    time_zone: time.timeZone,
    submitted_at: time.timestamp,
  };
}

export function viceLogFields(now = new Date()) {
  const time = localTrackingTime(VICE_DAY_START_HOUR, now);
  return {
    occurred_on: time.localDate,
    occurred_at: time.localTime,
    time_zone: time.timeZone,
    created_at: time.timestamp,
  };
}
