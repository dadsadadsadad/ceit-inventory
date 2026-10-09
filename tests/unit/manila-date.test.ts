import { describe, expect, it } from "vitest";

import {
  formatManilaDate,
  manilaCalendarDate,
  manilaDateText,
  manilaDateTimeText,
  manilaHour,
  nextManilaCalendarDate,
  startOfManilaDay,
} from "@/lib/manila-date";

describe("Philippine calendar helpers", () => {
  it("uses the Philippines calendar rather than the host timezone", () => {
    const instant = new Date("2026-08-27T18:30:00.000Z");
    expect(manilaCalendarDate(instant)).toBe("2026-08-28");
    expect(nextManilaCalendarDate(instant)).toBe("2026-08-29");
    expect(startOfManilaDay(instant).toISOString()).toBe("2026-08-27T16:00:00.000Z");
    expect(formatManilaDate(instant, { day: "numeric", month: "long", year: "numeric" })).toBe(
      "August 28, 2026",
    );
  });

  it("formats exported dates and times without a formatter", () => {
    const instant = new Date("2026-08-27T18:30:00.000Z");
    expect(manilaDateText(instant)).toBe("2026-08-28");
    expect(manilaDateTimeText(instant)).toBe("2026-08-28 02:30");
    expect(manilaDateText(instant)).toBe(manilaCalendarDate(instant));
  });

  it("reads the hour of the day in the Philippines", () => {
    expect(manilaHour(new Date("2026-08-27T18:30:00.000Z"))).toBe(2);
    expect(manilaHour(new Date("2026-08-27T03:59:00.000Z"))).toBe(11);
    expect(manilaHour(new Date("2026-08-27T16:00:00.000Z"))).toBe(0);
  });
});
