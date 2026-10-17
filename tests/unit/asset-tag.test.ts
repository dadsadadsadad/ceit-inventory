import { describe, expect, it } from "vitest";

import { assetTagPrefix, assetTagSequence, isInventoryAssetTag } from "@/lib/asset-tag";
import { normalizeTagCode, suggestTagCode } from "@/lib/asset-tag-code";

describe("inventory asset tags", () => {
  it("recognizes category-room-number tags without a status", () => {
    expect(isInventoryAssetTag("ROBOT-MIKRO-0001")).toBe(true);
    expect(isInventoryAssetTag("PC-CL1-0001")).toBe(true);
    expect(isInventoryAssetTag("INV-PCU-WK-05-0001")).toBe(false);
    expect(isInventoryAssetTag("CEIT-PC-001")).toBe(false);
  });

  it("builds the prefix from the category and room codes", () => {
    const prefix = assetTagPrefix("PC", "MIKRO");
    expect(prefix).toBe("PC-MIKRO-");
    expect(assetTagSequence("PC-MIKRO-0042", prefix)).toBe(42);
    expect(assetTagSequence("PC-MIKROX-0042", prefix)).toBeNull();
  });

  it("only accepts 2 to 6 letters or numbers", () => {
    expect(normalizeTagCode("rob-ot")).toBe("ROBOT");
    expect(normalizeTagCode("A")).toBeNull();
    expect(normalizeTagCode("TOOLONGCODE")).toBeNull();
  });

  it("suggests readable codes from names", () => {
    expect(suggestTagCode("Robotics")).toBe("ROBOT");
    expect(suggestTagCode("Cables")).toBe("CABLES");
    expect(suggestTagCode("COMPUTERS (MAC)")).toBe("MAC");
    expect(suggestTagCode("Tools & Utilities")).toBe("TOOLS");
    expect(suggestTagCode("Computer Laboratory 1")).toBe("COMP1");
    expect(suggestTagCode("Mikrotik")).toBe("MIKRO");
  });

  it("falls back to another readable code when one is taken", () => {
    expect(suggestTagCode("ECE Antenna", ["ECE"])).toBe("ANTEN");
    expect(suggestTagCode("PERIPHERALS (MAC)", ["MAC"])).toBe("PERIP");
    expect(suggestTagCode("Robotics", ["ROBOT"])).toBe("ROBO2");
  });
});
