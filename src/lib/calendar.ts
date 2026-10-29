// days are "YYYY-MM-DD" and months "YYYY-MM", in manila time

export type CalendarKind = "return" | "pickup" | "upkeep" | "license" | "warranty" | "event";

export const calendarKinds: Record<CalendarKind, { label: string; plural: string }> = {
  return: { label: "Return", plural: "Returns" },
  pickup: { label: "Pickup", plural: "Pickups" },
  upkeep: { label: "Maintenance due", plural: "Maintenance" },
  license: { label: "License ends", plural: "Licenses ending" },
  warranty: { label: "Warranty ends", plural: "Warranties ending" },
  event: { label: "Event", plural: "Events" },
};

export type CalendarEntry = {
  day: string;
  detail?: string;
  // only staff events can be removed
  eventId?: string;
  href?: string;
  id: string;
  kind: CalendarKind;
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

// rejects things like 2026-02-31
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

export function monthBounds(month: string) {
  const next = shiftMonth(month, 1);
  return {
    start: new Date(`${month}-01T00:00:00+08:00`),
    end: new Date(`${next}-01T00:00:00+08:00`),
    // for date-only columns
    startDay: new Date(`${month}-01T00:00:00.000Z`),
    endDay: new Date(`${next}-01T00:00:00.000Z`),
  };
}

// full weeks starting sunday
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

export function entriesByDay(entries: CalendarEntry[]) {
  const order: CalendarKind[] = ["return", "pickup", "upkeep", "event", "license", "warranty"];
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
