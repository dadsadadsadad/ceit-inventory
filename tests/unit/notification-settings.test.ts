import { ItemType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { deliveryOf, manilaWeekday, summaryDueOn } from "@/lib/notification-kinds";
import { stockGotWorse } from "@/lib/stock-level";

// 2026-10-24 is a Saturday in Manila
const saturday = new Date("2026-10-24T02:00:00.000Z");
const monday = new Date("2026-10-26T02:00:00.000Z");

describe("notification settings", () => {
  it("reads the delivery for each event", () => {
    expect(deliveryOf("returns", ["returns"], [])).toBe("now");
    expect(deliveryOf("returns", ["returns"], ["returns"])).toBe("summary");
    expect(deliveryOf("returns", [], ["returns"])).toBe("off");
  });

  it("uses the Philippine weekday", () => {
    expect(manilaWeekday(saturday)).toBe(6);
    // 11 PM UTC sunday is already monday in Manila
    expect(manilaWeekday(new Date("2026-10-25T23:00:00.000Z"))).toBe(1);
  });

  it("sends summaries on the chosen days", () => {
    expect(summaryDueOn({ summaryFrequency: "daily", summaryDay: 1 }, saturday)).toBe(true);
    expect(summaryDueOn({ summaryFrequency: "weekdays", summaryDay: 1 }, saturday)).toBe(false);
    expect(summaryDueOn({ summaryFrequency: "weekdays", summaryDay: 1 }, monday)).toBe(true);
    expect(summaryDueOn({ summaryFrequency: "weekly", summaryDay: 1 }, monday)).toBe(true);
    expect(summaryDueOn({ summaryFrequency: "weekly", summaryDay: 5 }, monday)).toBe(false);
    expect(summaryDueOn({ summaryFrequency: "off", summaryDay: 1 }, monday)).toBe(false);
  });
});

describe("low stock alerts", () => {
  const stock = (quantity: number) => ({
    itemType: ItemType.SUPPLY,
    lowStockThreshold: 5,
    quantity,
  });

  it("only fires when the level gets worse", () => {
    expect(stockGotWorse(stock(8), stock(5))).toBe(true);
    expect(stockGotWorse(stock(4), stock(0))).toBe(true);
    expect(stockGotWorse(stock(4), stock(3))).toBe(false);
    expect(stockGotWorse(stock(0), stock(2))).toBe(false);
    expect(stockGotWorse(stock(8), stock(7))).toBe(false);
  });

  it("ignores equipment", () => {
    const asset = { itemType: ItemType.ASSET, lowStockThreshold: null, quantity: 1 };
    expect(stockGotWorse(asset, { ...asset, quantity: 0 })).toBe(false);
  });
});
