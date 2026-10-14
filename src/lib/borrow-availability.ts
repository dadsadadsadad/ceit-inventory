import { ItemStatus, ItemType } from "@prisma/client";

export const borrowableInventoryStatuses = [ItemStatus.OK, ItemStatus.WORKING] as const;

export function canBorrowInventoryStatus(status: ItemStatus) {
  return borrowableInventoryStatuses.includes(
    status as (typeof borrowableInventoryStatuses)[number],
  );
}

// public pages show what can still be requested, not the raw stock
export function availableBorrowQuantity(quantity: number, pendingQuantity: number) {
  return Math.max(0, quantity - pendingQuantity);
}

// tracked assets stay at quantity 1 and switch to DEPLOYED when checked out, old grouped records still use quantity until split
export function usesIndividualAssetCheckout(
  item: { itemType: ItemType; quantity: number },
  requestedQuantity: number,
) {
  return item.itemType === ItemType.ASSET && item.quantity === 1 && requestedQuantity === 1;
}
