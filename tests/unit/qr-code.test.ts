import { describe, expect, it } from "vitest";

import { inventoryQrCodeFromScan, isInventoryQrCode } from "@/lib/qr-code";

describe("inventory QR validation", () => {
  it("accepts a canonical code", () => {
    expect(isInventoryQrCode("abcD_123-456")).toBe(true);
  });

  it("accepts a CEIT scan URL only from a trusted origin", () => {
    expect(inventoryQrCodeFromScan("https://inventory.example.edu/scan/abcD_123-456", "https://inventory.example.edu")).toBe("abcD_123-456");
    expect(inventoryQrCodeFromScan("https://attacker.example/scan/abcD_123-456", "https://inventory.example.edu")).toBe("");
  });

  it("rejects malformed and unrelated values", () => {
    expect(isInventoryQrCode("bad code")).toBe(false);
    expect(inventoryQrCodeFromScan("https://inventory.example.edu/dashboard", "https://inventory.example.edu")).toBe("");
  });
});
