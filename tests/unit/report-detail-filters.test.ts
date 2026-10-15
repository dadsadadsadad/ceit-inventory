import { ItemType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/prisma", () => ({ prisma: {} }));

import { parseReportExportFilters } from "@/lib/report-export-filters";
import { recordGaps } from "@/lib/reports/builders/health";
import { itemDetailChips, itemDetailWhere } from "@/lib/reports/builders/item-filters";
import { formatAge, formatPesoShort } from "@/lib/reports/format";

const now = new Date("2026-10-14T04:00:00Z");
const parse = (query: string) => parseReportExportFilters(new URLSearchParams(query), now);

describe("report detail filters", () => {
  it("reads a price range, purchase dates, a window, and a missing detail", () => {
    const filters = parse(
      "priceMin=1,000&priceMax=50000.5&purchasedFrom=2024-01-01&purchasedTo=2024-12-31&within=90&missing=price",
    );
    expect(filters.priceMin).toBe(1000);
    expect(filters.priceMax).toBe(50000.5);
    expect(filters.within).toBe(90);
    expect(filters.missing).toBe("price");
    expect(filters.purchased.from?.toISOString()).toBe("2023-12-31T16:00:00.000Z");
    expect(itemDetailChips(filters)).toEqual([
      `Price: ${formatPesoShort(1000)} to ${formatPesoShort(50000.5)}`,
      "Purchased: Jan 1, 2024 to Dec 31, 2024",
      "No purchase price",
    ]);
    expect(itemDetailWhere(filters, now)).toHaveLength(3);
  });

  it("refuses prices and choices it cannot read", () => {
    expect(() => parse("priceMin=-5")).toThrow(/peso amount/);
    expect(() => parse("priceMin=10&priceMax=5")).toThrow(/Min price/);
    expect(() => parse("within=45")).toThrow(/time window/);
    expect(() => parse("missing=everything")).toThrow(/missing detail/);
  });

  it("says what each record is missing", () => {
    const base = {
      _count: { photos: 1 },
      computer: null,
      isComputer: false,
      itemType: ItemType.ASSET,
      lastCheckedAt: new Date("2026-10-01T00:00:00Z"),
      purchaseDate: new Date("2024-01-01T00:00:00Z"),
      purchasePrice: 1000,
      serialNumber: "SN1",
      warrantyEndsAt: new Date("2027-01-01T00:00:00Z"),
    };
    expect(recordGaps(base, now)).toEqual([]);
    expect(
      recordGaps(
        {
          ...base,
          purchasePrice: null,
          serialNumber: null,
          _count: { photos: 0 },
          isComputer: true,
        },
        now,
      ),
    ).toEqual(["price", "serial", "photo", "pcDetails"]);
    expect(
      recordGaps(
        { ...base, itemType: ItemType.SUPPLY, serialNumber: null, warrantyEndsAt: null },
        now,
      ),
    ).toEqual([]);
    expect(recordGaps({ ...base, lastCheckedAt: new Date("2026-01-01T00:00:00Z") }, now)).toEqual([
      "inspection",
    ]);
  });

  it("writes ages in years and months", () => {
    expect(formatAge(new Date("2024-07-01T00:00:00Z"), now)).toBe("2 yr 3 mo");
    expect(formatAge(new Date("2026-05-01T00:00:00Z"), now)).toBe("5 mo");
    expect(formatAge(null, now)).toBe("");
  });
});
