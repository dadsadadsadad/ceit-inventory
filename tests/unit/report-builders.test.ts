import { beforeEach, describe, expect, it, vi } from "vitest";

const { database, computers } = vi.hoisted(() => ({
  database: {
    inventoryItem: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    category: { findUnique: vi.fn() },
    location: { findUnique: vi.fn() },
    borrowRequest: { count: vi.fn(), findMany: vi.fn() },
    maintenanceTicket: { count: vi.fn(), findMany: vi.fn() },
  },
  computers: { loadComputers: vi.fn(), loadSoftware: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/prisma", () => ({ prisma: database }));
vi.mock("@/lib/computer-queries", () => computers);

import { buildReport } from "@/lib/reports/build";
import { ReportRequestError } from "@/lib/reports/model";

const now = new Date("2026-10-06T04:00:00Z");
const pc = (name: string, room: string) => ({ id: name, name, assetTag: `TAG-${name}`, room });
const computer = (
  name: string,
  room: string,
  parts: Partial<{
    graphics: string | null;
    memoryGb: number | null;
    processor: string | null;
    storageGb: number | null;
  }> = {},
) => ({
  graphics: null,
  memoryGb: 16,
  operatingSystem: "Windows 11",
  osVersion: null,
  processor: "Core i5",
  storageGb: 512,
  storageType: "SSD",
  macAddress: null,
  ipAddress: null,
  lastCheckedAt: null,
  pc: pc(name, room),
  ...parts,
});

const run = (query: string, purpose: "csv" | "pdf" | "preview" = "preview") =>
  buildReport(new URLSearchParams(query), purpose, now);

describe("report builders", () => {
  beforeEach(() => vi.resetAllMocks());

  it("refuses an unknown report and accepts the old name for borrowing", async () => {
    await expect(run("kind=nothing")).rejects.toThrow(ReportRequestError);
    database.borrowRequest.findMany.mockResolvedValue([]);
    database.borrowRequest.count.mockResolvedValue(0);
    expect((await run("kind=borrowings")).kind).toBe("borrowing");
  });

  it("turns a bad filter into a request error", async () => {
    await expect(run("kind=inventory&category=nope")).rejects.toMatchObject({
      message: "Invalid category.",
      status: 400,
    });
  });

  describe("hardware", () => {
    beforeEach(() => {
      computers.loadComputers.mockResolvedValue({
        truncated: false,
        computers: [
          computer("PC 1", "Lab A"),
          computer("PC 2", "Lab A"),
          computer("PC 3", "Lab B", { processor: "Ryzen 5", memoryGb: 8 }),
          computer("PC 4", "Lab B", { processor: null, memoryGb: null, storageGb: null }),
        ],
      });
      database.location.findUnique.mockResolvedValue(null);
      database.category.findUnique.mockResolvedValue(null);
    });

    it("groups every part and lists each PC", async () => {
      const report = await run("kind=hardware");
      expect(report.tables.map((table) => table.heading)).toEqual([
        "By processor",
        "By memory",
        "By storage",
        "By graphics",
        "By operating system",
        "Every PC",
      ]);
      const processors = report.tables[0].rows;
      expect(processors[0].slice(0, 2)).toEqual(["Core i5", "2"]);
      expect(processors[0][2]).toContain("PC 1 (Lab A), PC 2 (Lab A)");
      expect(processors.at(-1)?.[0]).toBe("Not recorded");
      expect(report.metrics).toContainEqual(expect.objectContaining({ label: "PCs", value: "4" }));
      expect(report.metrics).toContainEqual(
        expect.objectContaining({ label: "Total memory", value: "40 GB" }),
      );
      expect(report.metrics).toContainEqual(
        expect.objectContaining({ label: "Missing details", value: "1", tone: "alert" }),
      );
      expect(report.filters).toEqual([]);
    });

    it("narrows to one part and to PCs missing details", async () => {
      const report = await run("kind=hardware&component=memory&incomplete=1");
      expect(report.tables).toHaveLength(1);
      expect(report.tables[0].heading).toBe("By memory");
      expect(report.tables[0].rows).toEqual([["Not recorded", "1", "PC 4 (Lab B)"]]);
      expect(report.filters).toEqual(["Part: Memory", "Missing hardware details"]);
      expect(report.title).toBe("Hardware: Memory");
    });

    it("only builds the spreadsheet for a CSV download", async () => {
      expect((await run("kind=hardware")).csv).toBeUndefined();
      const csv = (await run("kind=hardware", "csv")).csv;
      expect(csv).toHaveLength(5);
      expect(csv?.[1].slice(0, 4)).toEqual(["PC 1", "TAG-PC 1", "Lab A", "Core i5"]);
    });
  });

  describe("software", () => {
    const entry = (
      name: string,
      pcName: string,
      licenseExpiresAt: Date | null,
      version: string | null = "1.0",
    ) => ({
      name,
      version,
      licenseExpiresAt,
      licenseKeyHint: null,
      installedAt: null,
      pc: pc(pcName, "Lab A"),
    });

    beforeEach(() => {
      computers.loadSoftware.mockResolvedValue({
        truncated: false,
        entries: [
          entry("Zoom", "PC 1", new Date("2026-10-20T00:00:00Z")),
          entry("zoom", "PC 2", null, "2.0"),
          entry("Blender", "PC 1", new Date("2026-09-01T00:00:00Z")),
          entry("Notes", "PC 3", new Date("2027-08-01T00:00:00Z")),
        ],
      });
      database.location.findUnique.mockResolvedValue(null);
    });

    it("counts a title once however it is capitalised, and flags licenses", async () => {
      const report = await run("kind=software");
      expect(report.metrics).toEqual([
        expect.objectContaining({ label: "Titles", value: "3" }),
        expect.objectContaining({ label: "Installations", value: "4" }),
        expect.objectContaining({ label: "Licenses ending soon", value: "1", tone: "alert" }),
        expect.objectContaining({ label: "Licenses expired", value: "1", tone: "alert" }),
      ]);
      const titles = report.tables[0].rows;
      expect(titles.map((row) => row[0].toLowerCase())).toEqual(["blender", "notes", "zoom"]);
      expect(titles[2][1]).toBe("2");
      expect(titles[2][4]).toContain("PC 1 (Lab A), PC 2 (Lab A)");
      expect(report.tables[1].rows).toHaveLength(4);
    });

    it("passes the license filter through and orders by expiry", async () => {
      await run("kind=software&license=expiring&retired=1&q=zoom");
      expect(computers.loadSoftware).toHaveBeenCalledWith(
        expect.objectContaining({ license: "expiring", includeRetired: true, q: "zoom" }),
        now,
      );
    });
  });

  describe("inventory", () => {
    beforeEach(() => {
      database.inventoryItem.findMany.mockResolvedValue([]);
      database.inventoryItem.count.mockResolvedValue(7);
      database.inventoryItem.aggregate.mockResolvedValue({
        _count: { _all: 7 },
        _sum: { quantity: 12 },
      });
      database.inventoryItem.groupBy.mockResolvedValue([{ status: "OK", _count: { _all: 7 } }]);
      database.category.findUnique.mockResolvedValue({ name: "Projectors" });
      database.location.findUnique.mockResolvedValue({ name: "Lab 2" });
    });

    const id = "6f1c2f0e-8f6a-4a43-9d1b-0a8f4e5c9b11";

    it("describes the filters in words and counts the whole matching set", async () => {
      const report = await run(
        `kind=inventory&inventoryStatus=OK&category=${id}&location=${id}&attention=1&q=epson`,
      );
      expect(report.filters).toEqual([
        "Search: “epson”",
        "Status: OK",
        "Category: Projectors",
        "Room: Lab 2",
        "Needs attention",
      ]);
      expect(report.metrics[0]).toMatchObject({ label: "Records", value: "7" });
      expect(report.metrics[1]).toMatchObject({ label: "Units in stock", value: "12" });
      expect(database.inventoryItem.count).toHaveBeenCalled();
    });

    it("reads one page for a preview but a download looks for one row more than it allows", async () => {
      await run("kind=inventory", "preview");
      expect(database.inventoryItem.findMany.mock.calls[0][0].take).toBe(100);
      database.inventoryItem.findMany.mockClear();
      await run("kind=inventory", "pdf");
      expect(database.inventoryItem.findMany.mock.calls[0][0].take).toBe(2_001);
      database.inventoryItem.findMany.mockClear();
      await run("kind=inventory", "csv");
      expect(database.inventoryItem.findMany.mock.calls[0][0].take).toBe(10_001);
    });

    it("refuses a PDF that would hold too many rows", async () => {
      database.inventoryItem.findMany.mockResolvedValue(
        Array.from({ length: 2_001 }, (_, index) => ({ id: index })),
      );
      await expect(run("kind=inventory", "pdf")).rejects.toMatchObject({ status: 413 });
    });
  });

  describe("borrowing", () => {
    const request = (overrides: Record<string, unknown>) => ({
      inventoryItem: { name: "Projector", assetTag: "TAG-1" },
      borrowerName: "Ana",
      studentNumber: "2024-1",
      contact: "0917",
      purpose: "Class",
      requestedQuantity: 1,
      expectedReturnDate: new Date("2026-10-03T04:00:00Z"),
      requestedAt: new Date("2026-10-01T04:00:00Z"),
      startsAt: new Date("2026-10-01T04:00:00Z"),
      processedAt: new Date("2026-10-01T05:00:00Z"),
      returnedAt: null,
      returnRequestedAt: null,
      approvedAt: null,
      approvedByName: null,
      cancelledAt: null,
      staffNotes: null,
      returnRequestNotes: null,
      isReservation: false,
      status: "BORROWED",
      ...overrides,
    });

    beforeEach(() => {
      database.borrowRequest.count.mockResolvedValue(1);
    });

    it("shows how late a loan is and keeps overdue loans in the query", async () => {
      database.borrowRequest.findMany.mockResolvedValue([request({})]);
      const report = await run("kind=borrowing&borrowingState=overdue");
      expect(report.title).toBe("Overdue loans");
      expect(report.tables[0].rows[0][2]).toContain("Overdue by 3 days");
      expect(report.csv?.[1][13]).toBe(3);
      const where = database.borrowRequest.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain("expectedReturnDate");
      expect(report.filters).toEqual(["Showing: Overdue"]);
    });

    it("notes late returns", async () => {
      database.borrowRequest.findMany.mockResolvedValue([
        request({ status: "RETURNED", returnedAt: new Date("2026-10-05T04:00:00Z") }),
      ]);
      const report = await run("kind=borrowing&borrowingState=returned");
      expect(report.tables[0].rows[0][2]).toContain("(2 days late)");
    });
  });

  describe("maintenance", () => {
    it("reports the average time to fix", async () => {
      database.maintenanceTicket.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          openedAt: new Date("2026-09-01T00:00:00Z"),
          resolvedAt: new Date("2026-09-03T00:00:00Z"),
        },
        {
          openedAt: new Date("2026-09-01T00:00:00Z"),
          resolvedAt: new Date("2026-09-05T00:00:00Z"),
        },
      ]);
      database.maintenanceTicket.count.mockResolvedValue(0);
      const report = await run("kind=maintenance&maintenancePriority=HIGH");
      expect(report.metrics).toContainEqual(
        expect.objectContaining({ label: "Average time to fix", value: "3 days" }),
      );
      expect(report.filters).toEqual(["Priority: High"]);
    });
  });
});
