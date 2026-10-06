import { describe, expect, it } from "vitest";

import {
  dayHeading,
  entriesByDay,
  isMonthKey,
  monthBounds,
  monthGrid,
  monthTitle,
  parseCalendarDay,
  shiftMonth,
  type CalendarEntry,
} from "@/lib/calendar";

describe("calendar months", () => {
  it("accepts only real months in a sensible range", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("26-10")).toBe(false);
    expect(isMonthKey("1999-12")).toBe(false);
    expect(isMonthKey("2101-01")).toBe(false);
    expect(isMonthKey("2026-10; DROP TABLE")).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });

  it("moves between months across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
    expect(monthTitle("2026-10")).toBe("October 2026");
  });

  it("bounds a month in Philippine time, and in plain days", () => {
    const bounds = monthBounds("2026-10");
    expect(bounds.start.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(bounds.startDay.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(bounds.endDay.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("lays a month out in whole weeks, Sunday first", () => {
    // October 2026 starts on a Thursday and has 31 days: 4 leading + 31 + 0 trailing = 5 weeks.
    const grid = monthGrid("2026-10");
    expect(grid).toHaveLength(35);
    expect(grid[0]).toEqual({ day: "2026-09-27", inMonth: false });
    expect(grid[4]).toEqual({ day: "2026-10-01", inMonth: true });
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    // February 2026 starts on a Sunday and has 28 days: exactly four weeks.
    expect(monthGrid("2026-02")).toHaveLength(28);
  });
});

describe("calendar days", () => {
  it("accepts only days that exist", () => {
    expect(parseCalendarDay("2026-10-06")?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(parseCalendarDay("2026-02-30")).toBeNull();
    expect(parseCalendarDay("2026-13-01")).toBeNull();
    expect(parseCalendarDay("2026-10-6")).toBeNull();
    expect(parseCalendarDay("not a day")).toBeNull();
    expect(parseCalendarDay("")).toBeNull();
  });

  it("writes a day the way people say it", () => {
    expect(dayHeading("2026-10-06")).toBe("Tuesday, October 6");
  });

  it("lists a day's entries with returns first, then by name", () => {
    const entry = (id: string, kind: CalendarEntry["kind"], title: string): CalendarEntry => ({
      day: "2026-10-06",
      id,
      kind,
      title,
    });
    const day = entriesByDay([
      entry("a", "warranty", "Camera"),
      entry("b", "event", "Lab check"),
      entry("c", "return", "Projector"),
      entry("d", "return", "Laptop"),
    ]).get("2026-10-06")!;
    expect(day.map((item) => item.id)).toEqual(["d", "c", "b", "a"]);
  });
});
