import { describe, expect, it } from "vitest";

import { borrowingReportStatusFilter, parseReportExportFilters } from "@/lib/report-export-filters";

describe("report export filters", () => {
  const now = new Date("2026-09-01T05:30:00.000Z");

  it("uses the selected Manila period when no custom dates are provided", () => {
    const filters = parseReportExportFilters(new URLSearchParams({ period: "last-7-days" }), now);

    expect(filters.dateRange.from?.toISOString()).toBe("2026-08-25T16:00:00.000Z");
    expect(filters.dateRange.toExclusive?.toISOString()).toBe("2026-09-01T16:00:00.000Z");
  });

  it("prefers a valid custom date range over the preset period", () => {
    const filters = parseReportExportFilters(new URLSearchParams({ period: "today", from: "2026-08-01", to: "2026-08-15" }), now);

    expect(filters.dateRange.from?.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(filters.dateRange.toExclusive?.toISOString()).toBe("2026-08-15T16:00:00.000Z");
  });

  it("accepts defective, PC-only, and returned-borrowing filters", () => {
    const filters = parseReportExportFilters(new URLSearchParams({ inventoryStatus: "DEFECTIVE", pcOnly: "1", borrowingStatus: "RETURNED" }), now);

    expect(filters.inventoryStatus).toBe("DEFECTIVE");
    expect(filters.pcOnly).toBe(true);
    expect(filters.borrowingStatus).toBe("RETURNED");
  });

  it("groups currently borrowed reports with pending return confirmations", () => {
    const filters = parseReportExportFilters(new URLSearchParams({ borrowingState: "currently-borrowed" }), now);

    expect(filters.borrowingState).toBe("currently-borrowed");
    expect(borrowingReportStatusFilter(filters)).toEqual({ in: ["BORROWED", "RETURN_REQUESTED"] });
  });

  it("supports a returned-items report view and rejects invalid views", () => {
    const filters = parseReportExportFilters(new URLSearchParams({ borrowingState: "returned" }), now);

    expect(borrowingReportStatusFilter(filters)).toBe("RETURNED");
    expect(() => parseReportExportFilters(new URLSearchParams({ borrowingState: "checked-out" }), now)).toThrow("Invalid lending report view.");
  });

  it("rejects invalid and reversed ranges", () => {
    expect(() => parseReportExportFilters(new URLSearchParams({ from: "2026-09-12", to: "2026-09-01" }), now)).toThrow("Start date must be on or before end date.");
    expect(() => parseReportExportFilters(new URLSearchParams({ inventoryStatus: "BROKEN" }), now)).toThrow("Invalid inventory status.");
  });
});
