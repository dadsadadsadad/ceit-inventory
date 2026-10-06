import { ItemStatus, ItemType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { dueTodayWhere, reminderMessage } from "@/lib/loan-due";
import { personName } from "@/lib/person";
import {
  defaultLowStockThreshold,
  lowStockLevelFor,
  needsRestock,
  stockLevel,
  stockLevelSummary,
} from "@/lib/stock-level";
import { warrantyState, warrantyWhere } from "@/lib/warranty";

const stock = (quantity: number, lowStockThreshold: number | null = null, status?: ItemStatus) => ({
  itemType: ItemType.SUPPLY,
  lowStockThreshold,
  quantity,
  status,
});

describe("stock levels", () => {
  it("warns at 5 unless the record sets its own level", () => {
    expect(defaultLowStockThreshold).toBe(5);
    expect(lowStockLevelFor({ lowStockThreshold: null })).toBe(5);
    expect(stockLevel(stock(6))).toBe("ok");
    expect(stockLevel(stock(5))).toBe("low");
    expect(stockLevel(stock(1))).toBe("low");
    expect(stockLevel(stock(0))).toBe("out");
    expect(stockLevel(stock(8, 10))).toBe("low");
    expect(stockLevel(stock(11, 10))).toBe("ok");
  });

  it("lets a record opt out by setting its level to zero", () => {
    expect(stockLevel(stock(2, 0))).toBe("ok");
    expect(stockLevel(stock(0, 0))).toBe("out");
  });

  it("ignores equipment and records that are no longer in use", () => {
    expect(
      stockLevel({ itemType: ItemType.ASSET, lowStockThreshold: null, quantity: 1 }),
    ).toBeNull();
    expect(stockLevel(stock(0, null, ItemStatus.RETIRED))).toBe("ok");
    expect(needsRestock(stock(0, null, ItemStatus.LOST))).toBe(false);
    expect(needsRestock(stock(2))).toBe(true);
  });

  it("explains the level in a sentence", () => {
    expect(stockLevelSummary(stock(3))).toBe("3 left. Alert at 5 or fewer.");
    expect(stockLevelSummary(stock(0, 2))).toBe("None left. Alert at 2 or fewer.");
  });
});

describe("warranty states", () => {
  // Midday in Manila on 2026-10-06.
  const now = new Date("2026-10-06T04:00:00Z");
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

  it("runs a warranty through the whole of its last day", () => {
    expect(warrantyState(day("2026-10-06"), now)).toBe("ending");
    expect(warrantyState(day("2026-10-05"), now)).toBe("expired");
  });

  it("flags warranties ending within 60 days", () => {
    expect(warrantyState(day("2026-12-05"), now)).toBe("ending");
    expect(warrantyState(day("2026-12-06"), now)).toBe("active");
    expect(warrantyState(null, now)).toBe("none");
  });

  it("uses the Manila calendar day after midnight there", () => {
    // 00:30 on 2026-10-07 in Manila is still 2026-10-06 in UTC.
    const afterMidnight = new Date("2026-10-06T16:30:00Z");
    expect(warrantyState(day("2026-10-06"), afterMidnight)).toBe("expired");
  });

  it("queries the same boundaries", () => {
    expect(warrantyWhere("expired", now)).toEqual({ warrantyEndsAt: { lt: day("2026-10-06") } });
    expect(warrantyWhere("ending", now)).toEqual({
      warrantyEndsAt: { gte: day("2026-10-06"), lte: day("2026-12-05") },
    });
    expect(warrantyWhere("none", now)).toEqual({ warrantyEndsAt: null });
  });
});

describe("loans due today", () => {
  const now = new Date("2026-10-06T04:00:00Z");

  it("covers the rest of today in Manila, and nothing already late", () => {
    const where = dueTodayWhere(now);
    expect(where.expectedReturnDate).toEqual({
      gte: now,
      lt: new Date("2026-10-06T16:00:00.000Z"),
    });
    expect(where.status).toEqual({ in: ["BORROWED", "RETURN_REQUESTED"] });
  });

  it("writes a reminder with a first name and no private details", () => {
    const due = new Date("2026-10-06T09:00:00Z");
    const upcoming = reminderMessage({
      borrowerName: "Ana Cruz",
      dueAt: due,
      itemName: "Projector",
      late: false,
    });
    expect(upcoming).toContain("Hi Ana,");
    expect(upcoming).toContain("is due back on");
    expect(upcoming).not.toContain("Cruz");
    expect(
      reminderMessage({ borrowerName: "", dueAt: due, itemName: "Projector", late: true }),
    ).toContain("was due back on");
  });
});

describe("person names", () => {
  it("shows the username from a stored username and email", () => {
    expect(personName("rafael | rafael@school.edu")).toBe("rafael");
    expect(personName("rafael@school.edu")).toBe("rafael@school.edu");
    expect(personName(null)).toBeNull();
    expect(personName("  ")).toBeNull();
  });
});
