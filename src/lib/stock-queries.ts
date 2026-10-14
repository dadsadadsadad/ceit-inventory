import "server-only";

import { ItemStatus, ItemType, type Prisma } from "@prisma/client";

import { prisma } from "@/prisma";

import { defaultLowStockThreshold } from "./stock-level";

const inUse = { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] };

export function lowStockWhere(): Prisma.InventoryItemWhereInput {
  return {
    itemType: ItemType.SUPPLY,
    status: inUse,
    OR: [
      { lowStockThreshold: null, quantity: { lte: defaultLowStockThreshold } },
      {
        lowStockThreshold: { not: null },
        quantity: { lte: prisma.inventoryItem.fields.lowStockThreshold },
      },
    ],
  };
}

export function outOfStockWhere(): Prisma.InventoryItemWhereInput {
  return { itemType: ItemType.SUPPLY, status: inUse, quantity: { lte: 0 } };
}
