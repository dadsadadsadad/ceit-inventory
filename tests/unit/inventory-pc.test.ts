import { ItemType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { canHaveComputerDetails, isSingleTrackedAsset } from "@/lib/inventory-pc";

describe("PC inventory eligibility", () => {
  it("requires an explicit PC designation before details are allowed", () => {
    expect(canHaveComputerDetails({ isComputer: false, itemType: ItemType.ASSET, quantity: 1 })).toBe(false);
    expect(canHaveComputerDetails({ isComputer: true, itemType: ItemType.ASSET, quantity: 1 })).toBe(true);
  });

  it("keeps PC details limited to one tracked asset", () => {
    expect(isSingleTrackedAsset({ itemType: ItemType.SUPPLY, quantity: 1 })).toBe(false);
    expect(isSingleTrackedAsset({ itemType: ItemType.ASSET, quantity: 2 })).toBe(false);
    expect(isSingleTrackedAsset({ itemType: ItemType.ASSET, quantity: 1 })).toBe(true);
  });
});
