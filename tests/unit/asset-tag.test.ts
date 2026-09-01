import { ItemStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { assetTagPrefix, assetTagSequence, deriveAssetTagCode, isInventoryAssetTag, nextCategoryAssetTagCode, nextLocationAssetTagCode } from "@/lib/asset-tag";

describe("inventory asset tags", () => {
  it("recognizes the established CEIT inventory tag convention", () => {
    expect(isInventoryAssetTag("INV-PCU-WK-05-0001")).toBe(true);
    expect(isInventoryAssetTag("CEIT-PC-001")).toBe(false);
  });

  it("creates the same category, status, room, and sequence structure", () => {
    const prefix = assetTagPrefix("PCU", ItemStatus.WORKING, "05");
    expect(prefix).toBe("INV-PCU-WK-05-");
    expect(assetTagSequence("INV-PCU-WK-05-0042", prefix)).toBe(42);
  });

  it("derives unused codes for future setup values", () => {
    expect(deriveAssetTagCode("Desktop Computers", 3)).toBe("DCD");
    expect(nextCategoryAssetTagCode("Desktop Computers", ["DCD"])).toBe("DC1");
    expect(nextCategoryAssetTagCode("Desktop Computers", ["DCD", "DC1", "DC2", "DC3", "DC4", "DC5", "DC6", "DC7", "DC8", "DC9"])).toBe("D10");
    expect(nextLocationAssetTagCode(["05", "01", "02"])).toBe("03");
  });
});
