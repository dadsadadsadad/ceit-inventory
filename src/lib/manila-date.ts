const manilaTimeZone = "Asia/Manila";

export function formatManilaDate(value: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PH", { ...options, timeZone: manilaTimeZone }).format(value);
}

export function manilaCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: manilaTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "day" | "month" | "year") =>
    parts.find((entry) => entry.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");

  if (!year || !month || !day) {
    throw new Error("Unable to determine the current Philippine calendar date.");
  }
  return `${year}-${month}-${day}`;
}

export function nextManilaCalendarDate(date = new Date()) {
  const nextDay = new Date(`${manilaCalendarDate(date)}T12:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString().slice(0, 10);
}

export function startOfManilaDay(date = new Date()) {
  return new Date(`${manilaCalendarDate(date)}T00:00:00+08:00`);
}

// The Philippines does not observe daylight saving time, so a fixed UTC+8 offset is exact.
// This avoids creating a formatter for every cell of a large export.
const manilaOffsetMs = 8 * 60 * 60 * 1000;

export function manilaDateText(value: Date) {
  return new Date(value.getTime() + manilaOffsetMs).toISOString().slice(0, 10);
}

export function manilaDateTimeText(value: Date) {
  return new Date(value.getTime() + manilaOffsetMs).toISOString().slice(0, 16).replace("T", " ");
}
