import { ItemStatus, ItemType } from "@prisma/client";

export const borrowableInventoryStatuses = [ItemStatus.OK, ItemStatus.WORKING] as const;

export function canBorrowInventoryStatus(status: ItemStatus) {
  return borrowableInventoryStatuses.includes(status as (typeof borrowableInventoryStatuses)[number]);
}

/**
 * New equipment is stored one physical unit per asset record. Checking out one
 * of those records must not reduce its physical quantity to zero: the record
 * remains the one tagged unit and is temporarily marked DEPLOYED instead.
 *
 * Older grouped asset records retain quantity-based lending until they are
 * split, so their existing borrowing history can still be returned correctly.
 */
export function usesIndividualAssetCheckout(item: { itemType: ItemType; quantity: number }, requestedQuantity: number) {
  return item.itemType === ItemType.ASSET && item.quantity === 1 && requestedQuantity === 1;
}
