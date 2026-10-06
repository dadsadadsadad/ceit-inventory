import type { ItemStatus, ItemType } from "@prisma/client";

import { stockLevel, stockLevelLabel } from "@/lib/stock-level";
import { warrantyState, warrantyStateLabel } from "@/lib/warranty";

/** "Out of stock" or "Running low" for stock that needs restocking, and nothing otherwise. */
export function StockBadge({
  item,
  showCount = false,
}: {
  item: {
    itemType: ItemType;
    lowStockThreshold: number | null;
    quantity: number;
    status?: ItemStatus;
  };
  showCount?: boolean;
}) {
  const level = stockLevel(item);
  if (level === null || level === "ok") {
    return null;
  }
  return (
    <span
      className={`status-pill ${level === "out" ? "status-pill-critical" : "status-pill-pending"} rounded-md px-2 py-1 text-xs font-semibold`}
    >
      {stockLevelLabel(level)}
      {showCount && level === "low" ? ` · ${item.quantity} left` : ""}
    </span>
  );
}

/** "Warranty ended" or "Ends within 60 days" when a warranty needs attention. */
export function WarrantyBadge({ endsAt }: { endsAt: Date | null }) {
  const state = warrantyState(endsAt);
  if (state !== "expired" && state !== "ending") {
    return null;
  }
  return (
    <span
      className={`status-pill ${state === "expired" ? "status-pill-retired" : "status-pill-pending"} rounded-md px-2 py-1 text-xs font-semibold`}
    >
      {warrantyStateLabel(state)}
    </span>
  );
}
