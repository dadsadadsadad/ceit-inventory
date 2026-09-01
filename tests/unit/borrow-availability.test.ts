import { ItemStatus, ItemType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { borrowableInventoryStatuses, canBorrowInventoryStatus, usesIndividualAssetCheckout } from "@/lib/borrow-availability";

describe("borrowing availability", () => {
  it("only allows safe inventory statuses to be borrowed", () => {
    expect(borrowableInventoryStatuses).toEqual([ItemStatus.OK, ItemStatus.WORKING]);
    expect(canBorrowInventoryStatus(ItemStatus.OK)).toBe(true);
    expect(canBorrowInventoryStatus(ItemStatus.WORKING)).toBe(true);
    expect(canBorrowInventoryStatus(ItemStatus.DEPLOYED)).toBe(false);
    expect(canBorrowInventoryStatus(ItemStatus.RETIRED)).toBe(false);
  });

  it("keeps a one-unit physical asset intact while it is checked out", () => {
    expect(usesIndividualAssetCheckout({ itemType: ItemType.ASSET, quantity: 1 }, 1)).toBe(true);
    expect(usesIndividualAssetCheckout({ itemType: ItemType.ASSET, quantity: 2 }, 1)).toBe(false);
    expect(usesIndividualAssetCheckout({ itemType: ItemType.ASSET, quantity: 1 }, 2)).toBe(false);
    expect(usesIndividualAssetCheckout({ itemType: ItemType.SUPPLY, quantity: 1 }, 1)).toBe(false);
  });
});
