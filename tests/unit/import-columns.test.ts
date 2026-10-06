import { describe, expect, it } from "vitest";

import { matchHeaders, normalizeHeader } from "@/lib/import/columns";

function cells(...headings: string[]) {
  return headings.map((text, index) => ({ column: index + 1, text }));
}

describe("matching spreadsheet headings", () => {
  it("ignores case, spacing, and punctuation", () => {
    expect(normalizeHeader(" Serial No. ")).toBe("serialno");
    const match = matchHeaders(cells("ITEM NAME", "Serial_Number", "Qty"));
    expect(match.columns).toMatchObject({ name: 1, serialNumber: 2, quantity: 3 });
  });

  it("accepts common alternative names", () => {
    const match = matchHeaders(
      cells("Equipment", "Brand", "Property No.", "Warranty", "Reorder level", "Room"),
    );
    expect(match.columns).toMatchObject({
      name: 1,
      manufacturer: 2,
      assetTag: 3,
      warrantyEndsAt: 4,
      lowStockThreshold: 5,
      location: 6,
    });
  });

  it("does not need every column", () => {
    const match = matchHeaders(cells("Name"));
    expect(match.columns).toEqual({ name: 1 });
    expect(match.extra).toEqual([]);
    expect(match.score).toBe(1);
  });

  it("reports columns it does not know instead of rejecting them", () => {
    const match = matchHeaders(cells("Name", "Funding source", "Category", "Remarks 2"));
    expect(match.extra.map((cell) => cell.text)).toEqual(["Funding source", "Remarks 2"]);
    expect(match.matched.map((entry) => entry.header)).toEqual(["Name", "Category"]);
  });

  it("uses the first of two repeated headings and reports the second as extra", () => {
    const match = matchHeaders(cells("Name", "Price", "Cost"));
    expect(match.columns.purchasePrice).toBe(2);
    expect(match.extra.map((cell) => cell.text)).toEqual(["Cost"]);
  });

  it("lets one room column serve as both location and room number without listing it twice", () => {
    const match = matchHeaders(cells("Name", "Room Number"));
    expect(match.columns.location).toBe(2);
    expect(match.columns.roomNumber).toBe(2);
    expect(match.matched).toHaveLength(2);
  });

  it("scores a heading row higher than a row of data", () => {
    const heading = matchHeaders(cells("Name", "Category", "Location", "Quantity"));
    const data = matchHeaders(cells("Dell Monitor", "Peripherals", "Lab 1", "2"));
    expect(heading.score).toBeGreaterThan(data.score);
  });
});
