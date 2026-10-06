/**
 * The dashboard calendar: which things appear on it, and the month arithmetic behind the grid.
 * Days are Philippine calendar days written "YYYY-MM-DD"; months are "YYYY-MM".
 */

export type CalendarKind = "return" | "pickup" | "license" | "warranty" | "event";

export const calendarKinds: Record<CalendarKind, { label: string; plural: string }> = {
  return: { label: "Return", plural: "Returns" },
  pickup: { label: "Pickup", plural: "Pickups" },
  license: { label: "License ends", plural: "Licenses ending" },
  warranty: { label: "Warranty ends", plural: "Warranties ending" },
  event: { label: "Event", plural: "Events" },
};

export type CalendarEntry = {
  /** The Philippine calendar day it falls on. */
  day: string;
  /** A short second line, such as who has it or when. */
  detail?: string;
  /** Set for staff-made events, which can be removed. */
  eventId?: string;
  href?: string;
  id: string;
  kind: CalendarKind;
  /** A return that is already past its time. */
  late?: boolean;
  title: string;
};

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const dayPattern = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const earliestYear = 2000;
const latestYear = 2100;

export function isMonthKey(value: string | null | undefined): value is string {
  const match = value ? monthPattern.exec(value) : null;
  return Boolean(match && Number(match[1]) >= earliestYear && Number(match[1]) <= latestYear);
}

/** A real calendar day (so "2026-02-31" is refused), as a UTC midnight Date. */
export function parseCalendarDay(value: string | null | undefined) {
  const match = value ? dayPattern.exec(value) : null;
  if (!match) {
    return null;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value &&
    date.getUTCFullYear() >= earliestYear &&
    date.getUTCFullYear() <= latestYear
    ? date
    : null;
}

function parts(month: string) {
  const match = monthPattern.exec(month)!;
  return { year: Number(match[1]), index: Number(match[2]) - 1 };
}

function keyOf(year: number, index: number) {
  const date = new Date(Date.UTC(year, index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number) {
  const { year, index } = parts(month);
  return keyOf(year, index + delta);
}

export function monthOfDay(day: string) {
  return day.slice(0, 7);
}

export function monthTitle(month: string) {
  const { year, index } = parts(month);
  return new Date(Date.UTC(year, index, 1)).toLocaleDateString("en-PH", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

/** From the start of the month to the start of the next, in Philippine time. */
export function monthBounds(month: string) {
  const next = shiftMonth(month, 1);
  return {
    start: new Date(`${month}-01T00:00:00+08:00`),
    end: new Date(`${next}-01T00:00:00+08:00`),
    // The same bounds as plain dates, for columns that hold a day with no time.
    startDay: new Date(`${month}-01T00:00:00.000Z`),
    endDay: new Date(`${next}-01T00:00:00.000Z`),
  };
}

/** Whole weeks (Sunday first) that cover the month, so the grid is always a rectangle. */
export function monthGrid(month: string) {
  const { year, index } = parts(month);
  const first = new Date(Date.UTC(year, index, 1));
  const leading = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const cells = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, cell) => {
    const date = new Date(Date.UTC(year, index, 1 - leading + cell));
    const day = date.toISOString().slice(0, 10);
    return { day, inMonth: monthOfDay(day) === month };
  });
}

export function dayNumber(day: string) {
  return Number(day.slice(8, 10));
}

export function dayHeading(day: string) {
  const date = parseCalendarDay(day);
  return date
    ? date.toLocaleDateString("en-PH", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        weekday: "long",
      })
    : day;
}

/** Entries grouped by day, in the order they should be listed. */
export function entriesByDay(entries: CalendarEntry[]) {
  const order: CalendarKind[] = ["return", "pickup", "event", "license", "warranty"];
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
  }
  for (const list of byDay.values()) {
    list.sort(
      (left, right) =>
        order.indexOf(left.kind) - order.indexOf(right.kind) ||
        left.title.localeCompare(right.title),
    );
  }
  return byDay;
}
