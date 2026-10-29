import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  intervalLabel,
  planDue,
  planScopeLabel,
} from "@/lib/maintenance-plans";

describe("preventive maintenance", () => {
  it("adds days across months and leap years", () => {
    expect(addDays("2026-01-30", 30)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-29", "2026-11-05")).toBe(7);
  });

  it("says when a schedule is due", () => {
    expect(planDue("2026-10-26", "2026-10-29")).toMatchObject({
      state: "overdue",
      label: "3 days overdue",
    });
    expect(planDue("2026-10-28", "2026-10-29").label).toBe("1 day overdue");
    expect(planDue("2026-10-29", "2026-10-29")).toMatchObject({ state: "today" });
    expect(planDue("2026-10-30", "2026-10-29").label).toBe("Due tomorrow");
    expect(planDue("2026-11-05", "2026-10-29")).toMatchObject({
      state: "soon",
      label: "Due in 7 days",
    });
    expect(planDue("2026-11-06", "2026-10-29").state).toBe("later");
  });

  it("names intervals and what a schedule covers", () => {
    expect(intervalLabel(30)).toBe("Every month");
    expect(intervalLabel(1)).toBe("Every 1 day");
    expect(intervalLabel(45)).toBe("Every 45 days");
    expect(
      planScopeLabel({
        category: { name: "Desktop computers" },
        location: { name: "Computer Lab 1" },
        item: null,
      }),
    ).toBe("Computer Lab 1 · Desktop computers");
    expect(
      planScopeLabel({ category: null, location: null, item: { name: "Epson projector" } }),
    ).toBe("Epson projector");
  });
});
