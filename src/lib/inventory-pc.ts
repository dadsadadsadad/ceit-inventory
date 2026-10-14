import { ItemType } from "@prisma/client";

type ItemForPcProfile = {
  isComputer: boolean;
  itemType: ItemType;
  quantity: number;
};

export function isSingleTrackedAsset({
  itemType,
  quantity,
}: Pick<ItemForPcProfile, "itemType" | "quantity">) {
  return itemType === ItemType.ASSET && quantity === 1;
}

// only single tagged assets can have pc details
export function canHaveComputerDetails(item: ItemForPcProfile) {
  return item.isComputer && isSingleTrackedAsset(item);
}
