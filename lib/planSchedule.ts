type PlanDates = {
  scheduled_for: string | null;
  end_date?: string | null;
};

type PlanSchedule = PlanDates & {
  starts_at?: string | null;
  ends_at?: string | null;
};

export function planEndDate({ scheduled_for, end_date }: PlanDates) {
  return scheduled_for && end_date && end_date >= scheduled_for ? end_date : scheduled_for;
}

export function localDateTime(timestamp?: string | null) {
  const date = new Date(timestamp ?? "");
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function planClockTime(timestamp?: string | null) {
  return localDateTime(timestamp).slice(11);
}

function clockTimestamp(day: string, time: string, previous?: string | null) {
  const wallTime = `${day}T${time.length === 5 ? `${time}:00` : time}`;
  if (previous && localDateTime(previous) === wallTime) return previous;
  const timestamp = new Date(wallTime);
  if (Number.isNaN(timestamp.getTime()) || localDateTime(timestamp.toISOString()) !== wallTime) {
    throw new Error("That time does not exist on the selected date in your local time zone.");
  }
  return timestamp.toISOString();
}

export function planScheduleFields(
  startDate: string | null,
  endDate: string | null,
  startTime: string,
  endTime: string,
  previous?: PlanSchedule,
) {
  if (!startDate && (endDate || startTime || endTime)) {
    throw new Error("Choose a start date before setting an end date or time.");
  }
  if (endDate && startDate && endDate < startDate) {
    throw new Error("End date must be on or after the start date.");
  }
  if (endTime && !startTime) throw new Error("Set a start time before setting an end time.");

  const starts_at = startDate && startTime ? clockTimestamp(startDate, startTime, previous?.starts_at) : null;
  const ends_at = startDate && endTime ? clockTimestamp(endDate || startDate, endTime, previous?.ends_at) : null;
  if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) {
    throw new Error("End time must be after the start time. For an overnight plan, choose the next day as the end date.");
  }
  return { scheduled_for: startDate, end_date: endDate, starts_at, ends_at };
}

export function movePlanSchedule(plan: PlanSchedule, startDate: string | null) {
  if (startDate === plan.scheduled_for) return {};
  if (!startDate) return planScheduleFields(null, null, "", "");
  const dayNumber = (day: string) => Date.parse(day + "T00:00:00Z");
  const oldEnd = planEndDate(plan);
  const endDate = plan.end_date && oldEnd && plan.scheduled_for
    ? new Date(dayNumber(startDate) + dayNumber(oldEnd) - dayNumber(plan.scheduled_for)).toISOString().slice(0, 10)
    : null;
  const startTime = planClockTime(plan.starts_at);
  return planScheduleFields(startDate, endDate, startTime, startTime ? planClockTime(plan.ends_at) : "", plan);
}

export function planTimelineTimes(plan: PlanSchedule) {
  const start = planClockTime(plan.starts_at);
  if (!start) return null;
  const [hours, minutes] = start.split(":").map(Number);
  const fallbackEnd = `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  const end = planClockTime(plan.ends_at);
  const spansDays = planEndDate(plan) !== plan.scheduled_for;
  return {
    starts_at: start,
    ends_at: end && spansDays ? "23:00:00" : end > start ? end : fallbackEnd,
    canResize: !spansDays,
  };
}

export function resizePlanEnd(plan: PlanSchedule, endTime: string) {
  if (!plan.scheduled_for || planEndDate(plan) !== plan.scheduled_for) {
    throw new Error("Use the Plan editor to change the end time of a multi-day plan.");
  }
  const { starts_at, ends_at } = planScheduleFields(
    plan.scheduled_for, plan.end_date || null, planClockTime(plan.starts_at), endTime, plan,
  );
  return { starts_at, ends_at };
}
