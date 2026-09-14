import { describe, expect, it } from "vitest";
import { createCsv } from "@/lib/reports/csv";

describe("CSV downloads", () => {
  it("preserves commas, quotes, and line breaks inside cells", () => {
    expect(createCsv([["TV, 24 inch", 'Room "A"', "First line\nSecond line"]])).toBe(
      '"TV, 24 inch","Room ""A""","First line\nSecond line"',
    );
  });

  it("keeps formula-like input as text, including leading whitespace", () => {
    for (const value of ["=1+1", "+SUM(A1)", "-10+20", "@SUM(A1)", " \t=1+1"]) {
      expect(createCsv([[value]])).toBe(`"'${value}"`);
    }
  });

  it("exports dates, quantities, and empty values without changing column positions", () => {
    expect(createCsv([[new Date("2026-09-01T08:00:00Z"), 0, null, undefined], ["Next row"]])).toBe(
      '"2026-09-01T08:00:00.000Z","0","",""\r\n"Next row"',
    );
  });
});
