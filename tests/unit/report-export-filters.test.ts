import { describe, expect, it } from "vitest";

import {
  borrowingReportStatusFilter,
  borrowingReportDateWhere,
  parseReportExportFilters,
} from "@/lib/report-export-filters";

describe("report export filters", () => {
  const now = new Date("2026-09-01T05:30:00.000Z");

  it("uses the selected Manila period when no custom dates are provided", () => {
    const filters = parseReportExportFilters(new URLSearchParams({ period: "last-7-days" }), now);

    expect(filters.dateRange.from?.toISOString()).toBe("2026-08-25T16:00:00.000Z");
    expect(filters.dateRange.toExclusive?.toISOString()).toBe("2026-09-01T16:00:00.000Z");
  });

  it("prefers a valid custom date range over the preset period", () => {
    const filters = parseReportExportFilters(
      new URLSearchParams({ period: "today", from: "2026-08-01", to: "2026-08-15" }),
      now,
    );

    expect(filters.dateRange.from?.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(filters.dateRange.toExclusive?.toISOString()).toBe("2026-08-15T16:00:00.000Z");
  });

  it("accepts defective, PC-only, and returned-borrowing filters", () => {
    const filters = parseReportExportFilters(
      new URLSearchParams({
        inventoryStatus: "DEFECTIVE",
        pcOnly: "1",
        borrowingStatus: "RETURNED",
      }),
      now,
    );

    expect(filters.inventoryStatus).toBe("DEFECTIVE");
    expect(filters.pcOnly).toBe(true);
    expect(filters.borrowingStatus).toBe("RETURNED");
  });

  it("groups currently borrowed reports with pending return confirmations", () => {
    const filters = parseReportExportFilters(
      new URLSearchParams({ borrowingState: "currently-borrowed" }),
      now,
    );

    expect(filters.borrowingState).toBe("currently-borrowed");
    expect(borrowingReportStatusFilter(filters)).toEqual({ in: ["BORROWED", "RETURN_REQUESTED"] });
  });

  it("supports a returned-items report view and rejects invalid views", () => {
    const filters = parseReportExportFilters(
      new URLSearchParams({ borrowingState: "returned" }),
      now,
    );

    expect(borrowingReportStatusFilter(filters)).toBe("RETURNED");
    expect(() =>
      parseReportExportFilters(new URLSearchParams({ borrowingState: "checked-out" }), now),
    ).toThrow("Invalid lending report view.");
  });

  it("rejects invalid and reversed ranges", () => {
    expect(() =>
      parseReportExportFilters(new URLSearchParams({ from: "2026-09-12", to: "2026-09-01" }), now),
    ).toThrow("Start date must be on or before end date.");
    expect(() =>
      parseReportExportFilters(new URLSearchParams({ inventoryStatus: "BROKEN" }), now),
    ).toThrow("Invalid inventory status.");
  });

  it("exports reservations and cancellations with their distinct states", () => {
    for (const [borrowingState, status] of [
      ["reserved", "RESERVED"],
      ["cancelled", "CANCELLED"],
    ]) {
      const filters = parseReportExportFilters(new URLSearchParams({ borrowingState }), now);
      expect(borrowingReportStatusFilter(filters)).toBe(status);
    }
  });

  it("accepts known maintenance sources and rejects unrecognized sources", () => {
    for (const source of ["QR", "STAFF"] as const) {
      expect(
        parseReportExportFilters(new URLSearchParams({ maintenanceSource: source }), now)
          .maintenanceSource,
      ).toBe(source);
    }
    expect(() =>
      parseReportExportFilters(new URLSearchParams({ maintenanceSource: "unknown" }), now),
    ).toThrow("Invalid maintenance source.");
  });

  it.each([
    ["currently-borrowed", "processedAt"],
    ["overdue", "expectedReturnDate"],
    ["returned", "returnedAt"],
    ["reserved", "startsAt"],
    ["cancelled", "cancelledAt"],
    ["requested", "requestedAt"],
    ["declined", "requestedAt"],
    ["all", "requestedAt"],
  ])("filters %s reports by %s", (borrowingState, field) => {
    const filters = parseReportExportFilters(
      new URLSearchParams({ borrowingState, from: "2026-09-01", to: "2026-09-03" }),
      now,
    );
    expect(borrowingReportDateWhere(filters)).toEqual({
      [field]: {
        gte: new Date("2026-08-31T16:00:00Z"),
        lt: new Date("2026-09-03T16:00:00Z"),
      },
    });
  });

  it("leaves the date unrestricted for all-time exports", () => {
    const filters = parseReportExportFilters(new URLSearchParams(), now);
    expect(borrowingReportDateWhere(filters)).toEqual({});
  });

  it("reads the filters the report builder adds", () => {
    const id = "6f1c2f0e-8f6a-4a43-9d1b-0a8f4e5c9b11";
    const filters = parseReportExportFilters(
      new URLSearchParams({
        q: "  dell   lab ",
        category: id,
        location: id,
        condition: "POOR",
        itemType: "SUPPLY",
        attention: "1",
        incomplete: "1",
        retired: "1",
        license: "expiring",
        component: "memory",
        maintenanceStatus: "OPEN",
        maintenancePriority: "URGENT",
      }),
      now,
    );
    expect(filters).toMatchObject({
      query: "dell lab",
      categoryId: id,
      locationId: id,
      condition: "POOR",
      itemType: "SUPPLY",
      attention: true,
      incomplete: true,
      includeRetired: true,
      license: "expiring",
      component: "memory",
      maintenanceStatus: "OPEN",
      maintenancePriority: "URGENT",
    });
  });

  it("leaves the new filters off by default", () => {
    const filters = parseReportExportFilters(new URLSearchParams(), now);
    expect(filters).toMatchObject({ attention: false, incomplete: false, includeRetired: false });
    expect(filters.query).toBeUndefined();
    expect(filters.license).toBeUndefined();
  });

  it.each([
    ["category", "nope", "Invalid category."],
    ["location", "nope", "Invalid location."],
    ["condition", "BROKEN", "Invalid condition."],
    ["itemType", "THING", "Invalid item type."],
    ["license", "forever", "Invalid license filter."],
    ["component", "fan", "Invalid hardware component."],
    ["maintenanceStatus", "DONE", "Invalid maintenance status."],
    ["maintenancePriority", "SOON", "Invalid maintenance priority."],
  ])("rejects an invalid %s", (key, value, message) => {
    expect(() => parseReportExportFilters(new URLSearchParams({ [key]: value }), now)).toThrow(
      message,
    );
  });

  it("treats overdue like currently borrowed for the status check", () => {
    const filters = parseReportExportFilters(
      new URLSearchParams({ borrowingState: "overdue" }),
      now,
    );
    expect(borrowingReportStatusFilter(filters)).toEqual({ in: ["BORROWED", "RETURN_REQUESTED"] });
  });
});
