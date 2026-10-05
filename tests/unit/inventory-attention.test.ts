import { ItemCondition, ItemStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  inspectionIntervalDays,
  needsInventoryAttention,
  overdueInspectionWhere,
} from "@/lib/inventory-attention";

describe("equipment needing attention", () => {
  it("flags defective or untested equipment and poor condition that is still in service", () => {
    expect(
      needsInventoryAttention({ status: ItemStatus.DEFECTIVE, condition: ItemCondition.GOOD }),
    ).toBe(true);
    expect(
      needsInventoryAttention({ status: ItemStatus.NOT_TESTED, condition: ItemCondition.GOOD }),
    ).toBe(true);
    expect(
      needsInventoryAttention({ status: ItemStatus.OK, condition: ItemCondition.FOR_REPAIR }),
    ).toBe(true);
    expect(
      needsInventoryAttention({ status: ItemStatus.WORKING, condition: ItemCondition.POOR }),
    ).toBe(true);
  });

  it("does not flag healthy equipment or records that are no longer in service", () => {
    expect(needsInventoryAttention({ status: ItemStatus.OK, condition: ItemCondition.GOOD })).toBe(
      false,
    );
    expect(
      needsInventoryAttention({ status: ItemStatus.DEPLOYED, condition: ItemCondition.FAIR }),
    ).toBe(false);
    expect(
      needsInventoryAttention({ status: ItemStatus.RETIRED, condition: ItemCondition.POOR }),
    ).toBe(false);
    expect(
      needsInventoryAttention({ status: ItemStatus.LOST, condition: ItemCondition.GOOD }),
    ).toBe(false);
  });

  it("looks for items not checked within the inspection interval, or never checked", () => {
    const now = new Date("2026-10-06T00:00:00Z");
    const where = overdueInspectionWhere(now) as {
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: Date } }];
    };
    expect(where.OR[0]).toEqual({ lastCheckedAt: null });
    expect(where.OR[1].lastCheckedAt.lt.getTime()).toBe(
      now.getTime() - inspectionIntervalDays * 24 * 60 * 60 * 1000,
    );
  });
});
