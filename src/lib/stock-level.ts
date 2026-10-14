import { ItemStatus, ItemType } from "@prisma/client";

export const defaultLowStockThreshold = 5;

export type StockLevel = "ok" | "low" | "out";

type StockItem = {
  itemType: ItemType;
  lowStockThreshold: number | null;
  quantity: number;
  status?: ItemStatus;
};

export function lowStockLevelFor(item: Pick<StockItem, "lowStockThreshold">) {
  return item.lowStockThreshold ?? defaultLowStockThreshold;
}

// assets don't have stock levels, retired/lost never alert
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
