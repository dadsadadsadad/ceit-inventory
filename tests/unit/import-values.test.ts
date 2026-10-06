import { ItemCondition, ItemStatus, ItemType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { importedCustomValues } from "@/lib/import/custom";
import {
  ImportRowError,
  isSummaryName,
  looseCondition,
  looseItemType,
  loosePrice,
  looseSizeGb,
  looseStatus,
  looseWholeNumber,
  optionalDate,
  parseLooseDate,
} from "@/lib/import/values";

function collector() {
  const messages: string[] = [];
  return { messages, warn: (message: string) => void messages.push(message) };
}

function isoDay(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? null;
}

describe("reading dates", () => {
  it("reads the formats people type", () => {
    expect(isoDay(parseLooseDate("2026-01-15"))).toBe("2026-01-15");
    expect(isoDay(parseLooseDate("1/15/2026"))).toBe("2026-01-15");
    expect(isoDay(parseLooseDate("15/1/2026"))).toBe("2026-01-15");
    expect(isoDay(parseLooseDate("15 Jan 2026"))).toBe("2026-01-15");
    expect(isoDay(parseLooseDate("January 15, 2026"))).toBe("2026-01-15");
    expect(isoDay(parseLooseDate("Sept 3, 2025"))).toBe("2025-09-03");
  });

  it("reads an unformatted Excel date number", () => {
    expect(isoDay(parseLooseDate("46037"))).toBe("2026-01-15");
  });

  it("refuses dates that do not exist", () => {
    expect(parseLooseDate("2026-02-31")).toBeNull();
    expect(parseLooseDate("soon")).toBeNull();
  });

  it("leaves an unreadable optional date blank with a warning", () => {
    const { messages, warn } = collector();
    expect(optionalDate("someday", "Warranty end date", warn)).toBeNull();
    expect(messages[0]).toContain("Warranty end date");
    expect(optionalDate("", "Warranty end date", warn)).toBeNull();
    expect(messages).toHaveLength(1);
  });
});

describe("reading numbers", () => {
  it("accepts plain, formatted, and unit-suffixed whole numbers", () => {
    const { messages, warn } = collector();
    expect(looseWholeNumber("5", 1, "Quantity", warn)).toBe(5);
    expect(looseWholeNumber("1,200", 1, "Quantity", warn)).toBe(1_200);
    expect(looseWholeNumber("5 pcs", 1, "Quantity", warn)).toBe(5);
    expect(looseWholeNumber("3.0", 1, "Quantity", warn)).toBe(3);
    expect(messages).toEqual([]);
  });

  it("falls back and warns on nonsense, and refuses absurd quantities", () => {
    const { messages, warn } = collector();
    expect(looseWholeNumber("a few", 1, "Quantity", warn)).toBe(1);
    expect(looseWholeNumber("", null, "Low stock level", warn)).toBeNull();
    expect(messages).toHaveLength(1);
    expect(() => looseWholeNumber("99999999999", 1, "Quantity", warn)).toThrow(ImportRowError);
  });

  it("converts memory and storage sizes to GB", () => {
    const { messages, warn } = collector();
    expect(looseSizeGb("8", "Memory", warn)).toBe(8);
    expect(looseSizeGb("16 GB", "Memory", warn)).toBe(16);
    expect(looseSizeGb("1TB", "Storage", warn)).toBe(1_024);
    expect(looseSizeGb("2048 mb", "Storage", warn)).toBe(2);
    expect(looseSizeGb("lots", "Storage", warn)).toBeNull();
    expect(messages).toHaveLength(1);
  });

  it("reads peso amounts", () => {
    const { messages, warn } = collector();
    expect(loosePrice("₱1,200", warn)).toBe("1200.00");
    expect(loosePrice("PHP 45000.5", warn)).toBe("45000.50");
    expect(loosePrice("", warn)).toBeNull();
    expect(loosePrice("free", warn)).toBeNull();
    expect(messages).toHaveLength(1);
  });
});

describe("reading words", () => {
  it("understands type, status and condition synonyms", () => {
    const { messages, warn } = collector();
    expect(looseItemType("Consumable", warn)).toBe(ItemType.SUPPLY);
    expect(looseItemType("hardware", warn)).toBe(ItemType.ASSET);
    expect(looseItemType("", warn)).toBe(ItemType.ASSET);
    expect(looseStatus("Broken", ItemStatus.OK, warn)).toBe(ItemStatus.DEFECTIVE);
    expect(looseStatus("In use", ItemStatus.OK, warn)).toBe(ItemStatus.DEPLOYED);
    expect(looseStatus("NOT TESTED", ItemStatus.OK, warn)).toBe(ItemStatus.NOT_TESTED);
    expect(looseCondition("needs repair", ItemCondition.GOOD, warn)).toBe(ItemCondition.FOR_REPAIR);
    expect(looseCondition("Brand new", ItemCondition.GOOD, warn)).toBe(ItemCondition.EXCELLENT);
    expect(messages).toEqual([]);
  });

  it("keeps the fallback and warns for words it does not know", () => {
    const { messages, warn } = collector();
    expect(looseStatus("haunted", ItemStatus.OK, warn)).toBe(ItemStatus.OK);
    expect(looseItemType("gizmo", warn)).toBe(ItemType.ASSET);
    expect(messages).toHaveLength(2);
  });

  it("spots total rows", () => {
    expect(isSummaryName("Total")).toBe(true);
    expect(isSummaryName("grand totals:")).toBe(true);
    expect(isSummaryName("Total Station")).toBe(false);
  });
});

describe("filling extra fields from columns", () => {
  const field = (fieldType: "DATE" | "YES_NO" | "CHOICE" | "NUMBER", choices: string[] = []) => ({
    appliesTo: null,
    categoryId: null,
    choices,
    fieldType,
    id: `f-${fieldType}`,
    label: fieldType,
    sortOrder: 0,
  });

  it("puts each answer into the form the field expects", () => {
    const { messages, warn } = collector();
    const values = importedCustomValues(
      [
        { field: field("YES_NO"), raw: "Y" },
        { field: field("DATE"), raw: "1/15/2026" },
        { field: field("CHOICE", ["Canon EF", "Sony E"]), raw: "sony e" },
        { field: field("NUMBER"), raw: "1,250" },
      ],
      warn,
    );
    expect(values).toEqual({
      "f-YES_NO": true,
      "f-DATE": "2026-01-15",
      "f-CHOICE": "Sony E",
      "f-NUMBER": 1_250,
    });
    expect(messages).toEqual([]);
  });

  it("drops an answer that does not fit and says so", () => {
    const { messages, warn } = collector();
    const values = importedCustomValues(
      [
        { field: field("CHOICE", ["Canon EF"]), raw: "Nikon Z" },
        { field: field("YES_NO"), raw: "maybe" },
        { field: field("DATE"), raw: "" },
      ],
      warn,
    );
    expect(values).toEqual({});
    expect(messages).toHaveLength(2);
  });
});
