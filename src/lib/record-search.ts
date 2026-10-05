import { ItemCondition, ItemStatus, ItemType, type Prisma } from "@prisma/client";

import { isUuid } from "./ids";
import { inventoryAttentionWhere, overdueInspectionWhere } from "./inventory-attention";
import { everyTermMatches, searchTerms } from "./search-terms";

/** The searches behind the inventory, borrowing, and maintenance lists and their reports. */

export type InventorySearch = {
  attention?: string;
  category?: string;
  checked?: string;
  condition?: string;
  itemType?: string;
  location?: string;
  q?: string;
  status?: string;
};

export function isItemStatus(value?: string): value is ItemStatus {
  return Boolean(value && Object.values(ItemStatus).includes(value as ItemStatus));
}

export function isItemType(value?: string): value is ItemType {
  return Boolean(value && Object.values(ItemType).includes(value as ItemType));
}

export function isItemCondition(value?: string): value is ItemCondition {
  return Boolean(value && Object.values(ItemCondition).includes(value as ItemCondition));
}

// Build the inventory query from the active filters.
export function inventoryWhere(search: InventorySearch) {
  const terms = searchTerms(search.q?.trim().slice(0, 120));
  const where: Prisma.InventoryItemWhereInput = {};
  const requirements: Prisma.InventoryItemWhereInput[] = [];

  if (terms.length) {
    requirements.push(
      ...everyTermMatches<Prisma.InventoryItemWhereInput>(terms, (term) => [
        { name: { contains: term, mode: "insensitive" } },
        { assetTag: { contains: term, mode: "insensitive" } },
        { serialNumber: { contains: term, mode: "insensitive" } },
        { manufacturer: { contains: term, mode: "insensitive" } },
        { model: { contains: term, mode: "insensitive" } },
        { category: { name: { contains: term, mode: "insensitive" } } },
        { location: { name: { contains: term, mode: "insensitive" } } },
        { location: { roomNumber: { contains: term, mode: "insensitive" } } },
        { computer: { is: { macAddress: { contains: term, mode: "insensitive" } } } },
        { computer: { is: { ipAddress: { contains: term, mode: "insensitive" } } } },
      ]),
    );
  }
  if (search.attention === "1") {
    requirements.push(inventoryAttentionWhere);
  }
  if (search.checked === "overdue") {
    requirements.push(overdueInspectionWhere());
  }
  if (requirements.length) {
    where.AND = requirements;
  }

  if (isItemStatus(search.status)) {
    where.status = search.status;
  }
  if (search.location && isUuid(search.location)) {
    where.locationId = search.location;
  }
  if (search.category && isUuid(search.category)) {
    where.categoryId = search.category;
  }
  if (isItemType(search.itemType)) {
    where.itemType = search.itemType;
  }
  if (isItemCondition(search.condition)) {
    where.condition = search.condition;
  }
  return where;
}

/** Borrower, student number, contact, or the equipment's name or asset tag. */
export function borrowSearchWhere(query: string | undefined): Prisma.BorrowRequestWhereInput[] {
  return everyTermMatches<Prisma.BorrowRequestWhereInput>(searchTerms(query), (term) => [
    { borrowerName: { contains: term, mode: "insensitive" } },
    { studentNumber: { contains: term, mode: "insensitive" } },
    { contact: { contains: term, mode: "insensitive" } },
    { inventoryItem: { is: { name: { contains: term, mode: "insensitive" } } } },
    { inventoryItem: { is: { assetTag: { contains: term, mode: "insensitive" } } } },
  ]);
}

/** The issue title or description, or the equipment's name or asset tag. */
export function maintenanceSearchWhere(
  query: string | undefined,
): Prisma.MaintenanceTicketWhereInput[] {
  return everyTermMatches<Prisma.MaintenanceTicketWhereInput>(searchTerms(query), (term) => [
    { title: { contains: term, mode: "insensitive" } },
    { description: { contains: term, mode: "insensitive" } },
    { inventoryItem: { name: { contains: term, mode: "insensitive" } } },
    { inventoryItem: { assetTag: { contains: term, mode: "insensitive" } } },
  ]);
}
