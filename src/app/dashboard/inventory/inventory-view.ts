export const inventoryViews = ["list", "cards", "compact"] as const;
export type InventoryView = (typeof inventoryViews)[number];
export const inventoryViewCookie = "ceit-inventory-view";

export function inventoryViewOf(value: string | null | undefined): InventoryView {
  return inventoryViews.includes(value as InventoryView) ? (value as InventoryView) : "list";
}
