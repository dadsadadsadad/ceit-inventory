import { describe, expect, it } from "vitest";

import { formatManilaDate, manilaCalendarDate, nextManilaCalendarDate, startOfManilaDay } from "@/lib/manila-date";

describe("Philippine calendar helpers", () => {
  it("uses the Philippines calendar rather than the host timezone", () => {
    const instant = new Date("2026-08-27T18:30:00.000Z");
    expect(manilaCalendarDate(instant)).toBe("2026-08-28");
    expect(nextManilaCalendarDate(instant)).toBe("2026-08-29");
    expect(startOfManilaDay(instant).toISOString()).toBe("2026-08-27T16:00:00.000Z");
    expect(formatManilaDate(instant, { day: "numeric", month: "long", year: "numeric" })).toBe("August 28, 2026");
  });
});
