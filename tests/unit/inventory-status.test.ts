import { describe, expect, it } from "vitest";

import { inventoryStatusClass, inventoryStatusLabel } from "@/lib/inventory-status";

describe("inventory status presentation", () => {
  it("formats stored statuses for people", () => {
    expect(inventoryStatusLabel("NOT_TESTED")).toBe("Not Tested");
    expect(inventoryStatusLabel("FOR_REPAIR")).toBe("For Repair");
  });

  it("uses an explicit visual state for every supported status", () => {
    expect(inventoryStatusClass("OK")).toContain("positive");
    expect(inventoryStatusClass("DEPLOYED")).toContain("deployed");
    expect(inventoryStatusClass("DEFECTIVE")).toContain("critical");
    expect(inventoryStatusClass("NOT_TESTED")).toContain("pending");
    expect(inventoryStatusClass("RETIRED")).toContain("retired");
  });
});
