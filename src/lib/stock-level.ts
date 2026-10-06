import { ItemStatus, ItemType } from "@prisma/client";

/** Stock records warn when their quantity falls to this number, unless the record sets its own. */
export const defaultLowStockThreshold = 5;

export type StockLevel = "ok" | "low" | "out";

type StockItem = {
  itemType: ItemType;
  lowStockThreshold: number | null;
  quantity: number;
  status?: ItemStatus;
};

/** The quantity at or below which this record counts as running low. */
export function lowStockLevelFor(item: Pick<StockItem, "lowStockThreshold">) {
  return item.lowStockThreshold ?? defaultLowStockThreshold;
}

/**
 * Where a stock record stands: "out" at zero, "low" at or below its alert level, otherwise "ok".
 * Equipment is counted one unit at a time, so it has no stock level. Retired and lost records
 * are no longer in use, so they never raise an alert.
 */
export function stockLevel(item: StockItem): StockLevel | null {
  if (item.itemType !== ItemType.SUPPLY) {
    return null;
  }
  if (item.status === ItemStatus.RETIRED || item.status === ItemStatus.LOST) {
    return "ok";
  }
  if (item.quantity <= 0) {
    return "out";
  }
  return item.quantity <= lowStockLevelFor(item) ? "low" : "ok";
}

export function needsRestock(item: StockItem) {
  const level = stockLevel(item);
  return level === "low" || level === "out";
}

export function stockLevelLabel(level: StockLevel) {
  return { ok: "In stock", low: "Running low", out: "Out of stock" }[level];
}

/** A short sentence for item pages and tooltips, such as "3 left. Alert at 5 or fewer." */
export function stockLevelSummary(item: StockItem) {
  const level = stockLevel(item);
  if (level === null) {
    return null;
  }
  const alertAt = lowStockLevelFor(item);
  if (level === "out") {
    return `None left. Alert at ${alertAt} or fewer.`;
  }
  return `${item.quantity} left. Alert at ${alertAt} or fewer.`;
}
