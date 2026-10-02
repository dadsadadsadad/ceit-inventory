import { beforeEach, describe, expect, it, vi } from "vitest";

const { database, writer } = vi.hoisted(() => ({
  database: {
    inventoryItem: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    category: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
    maintenanceTicket: { count: vi.fn(), findMany: vi.fn() },
    borrowRequest: { count: vi.fn(), findMany: vi.fn() },
  },
  writer: {
    addBody: vi.fn(),
    addHeading: vi.fn(),
    addMetricRow: vi.fn(),
    addTable: vi.fn(),
    addSubheading: vi.fn(),
    addDetailGrid: vi.fn(),
    finish: vi.fn(),
  },
}));

vi.mock("@/prisma", () => ({ prisma: database }));
vi.mock("@/lib/reports/pdf-writer", () => ({
  mutedColor: {},
  reportDocument: vi.fn(async () => ({ document: {}, writer })),
  documentResponse: vi.fn(() => new Response(null)),
}));

import { parseReportExportFilters } from "@/lib/report-export-filters";
import { createInventoryPdf } from "@/lib/reports/pdf/inventory";
import { createOverviewPdf } from "@/lib/reports/pdf/overview";
import { createPcRegisterPdf } from "@/lib/reports/pdf/pcs";

const date = new Date("2026-10-01T00:00:00Z");

describe("PDF report summaries", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["inventory", createInventoryPdf],
    ["PC register", createPcRegisterPdf],
  ] as const)(
    "includes poor and repair conditions in the %s attention count",
    async (_name, create) => {
      database.inventoryItem.findMany.mockResolvedValue(
        [
          ["OK", "GOOD"],
          ["WORKING", "POOR"],
          ["OK", "FOR_REPAIR"],
          ["DEFECTIVE", "GOOD"],
          ["NOT_TESTED", "GOOD"],
        ].map(([status, condition], index) => ({
          name: `Equipment ${index}`,
          assetTag: `TEST-${index}`,
          qrCode: `test-${index}`,
          status,
          condition,
          itemType: "ASSET",
          isComputer: true,
          quantity: 1,
          createdAt: date,
          category: { name: "Computers" },
          location: { name: "Lab" },
          computer: null,
        })),
      );
      await create(parseReportExportFilters(new URLSearchParams()), "2026-10-01");
      expect(writer.addMetricRow.mock.calls.flat(2)).toContainEqual({
        label: "Needs attention",
        value: "4",
      });
    },
  );

  it("discloses every capped overview section without changing its complete totals", async () => {
    database.inventoryItem.aggregate.mockResolvedValue({
      _count: { _all: 50, purchasePrice: 0 },
      _sum: { quantity: 50, purchasePrice: null },
    });
    database.inventoryItem.groupBy.mockResolvedValue([]);
    database.inventoryItem.count.mockResolvedValue(0);
    database.inventoryItem.findMany.mockResolvedValue([]);
    const groups = Array.from({ length: 13 }, (_, index) => ({
      name: `Group ${index}`,
      _count: { items: index + 1 },
    }));
    database.category.findMany.mockResolvedValue(groups);
    database.location.findMany.mockResolvedValue(groups);
    database.maintenanceTicket.count.mockResolvedValue(22);
    database.borrowRequest.count.mockResolvedValue(22);
    const records = Array.from({ length: 20 }, (_, index) => ({
      inventoryItem: { name: `Item ${index}`, assetTag: `TEST-${index}` },
      title: "Inspection",
      priority: "NORMAL",
      openedAt: date,
      borrowerName: "Test borrower",
      expectedReturnDate: date,
      startsAt: date,
      status: "BORROWED",
    }));
    database.maintenanceTicket.findMany.mockResolvedValue(records);
    database.borrowRequest.findMany.mockResolvedValue(records);

    await createOverviewPdf(true, "2026-10-01");

    expect(writer.addHeading.mock.calls.flat()).toEqual(
      expect.arrayContaining([
        "Items by category (top 12)",
        "Items by location (top 12)",
        "Open maintenance requests (first 20 of 22)",
        "Overdue (first 20 of 22)",
      ]),
    );
    expect(writer.addMetricRow.mock.calls.flat(2)).toContainEqual({
      label: "Open maintenance",
      value: "22",
    });
  });
});
