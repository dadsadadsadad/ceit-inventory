import { ItemCondition, ItemStatus, ItemType, Prisma } from "@prisma/client";

import { inventoryAttentionWhere, overdueInspectionWhere } from "@/lib/inventory-attention";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/search-params";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";

export const pageSize = 25;
export const maximumBulkSelection = 10_000;

export type SearchParams = {
  attention?: string;
  bulk?: string;
  category?: string;
  checked?: string;
  condition?: string;
  direction?: string;
  itemType?: string;
  location?: string;
  page?: string;
  q?: string;
  sort?: string;
  status?: string;
};
export type RawSearchParams = { [Key in keyof SearchParams]?: string | string[] };
export type InventoryListItem = Prisma.InventoryItemGetPayload<{
  select: typeof inventoryListSelect;
}>;
export type SortDirection = "asc" | "desc";
export type SortField = "assetTag" | "item" | "location" | "stock" | "status";

const sortableFields: SortField[] = ["assetTag", "item", "location", "stock", "status"];
export const inventoryListSelect = {
  id: true,
  name: true,
  assetTag: true,
  quantity: true,
  status: true,
  lastCheckedAt: true,
  category: { select: { name: true } },
  computer: { select: { id: true } },
  location: { select: { name: true } },
} satisfies Prisma.InventoryItemSelect;

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
export function inventoryWhere(search: SearchParams) {
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

export function currentSort(
  search: SearchParams,
): { direction: SortDirection; field: SortField } | null {
  const field = sortableFields.find((candidate) => candidate === search.sort);
  if (!field) {
    return null;
  }
  return { field, direction: search.direction === "desc" ? "desc" : "asc" };
}

// Apply the selected sort with a stable fallback order.
export function inventoryOrderBy(
  sort: ReturnType<typeof currentSort>,
): Prisma.InventoryItemOrderByWithRelationInput[] {
  if (!sort) {
    return [{ updatedAt: "desc" }, { id: "asc" }];
  }

  switch (sort.field) {
    case "assetTag":
      return [{ assetTag: sort.direction }, { id: "asc" }];
    case "item":
      return [{ name: sort.direction }, { id: "asc" }];
    case "location":
      return [{ location: { name: sort.direction } }, { id: "asc" }];
    case "stock":
      return [{ quantity: sort.direction }, { id: "asc" }];
    case "status":
      return [{ status: sort.direction }, { id: "asc" }];
  }
}

// Keep active filters when building links.
export function inventoryFilterParameters(search: SearchParams) {
  const parameters = new URLSearchParams();
  if (search.q?.trim()) {
    parameters.set("q", search.q.trim().slice(0, 120));
  }
  if (isItemStatus(search.status)) {
    parameters.set("status", search.status);
  }
  if (search.location && isUuid(search.location)) {
    parameters.set("location", search.location);
  }
  if (search.category && isUuid(search.category)) {
    parameters.set("category", search.category);
  }
  if (isItemType(search.itemType)) {
    parameters.set("itemType", search.itemType);
  }
  if (isItemCondition(search.condition)) {
    parameters.set("condition", search.condition);
  }
  if (search.attention === "1") {
    parameters.set("attention", "1");
  }
  if (search.checked === "overdue") {
    parameters.set("checked", "overdue");
  }
  return parameters;
}

// Keep a separate selection for each set of filters.
export function selectionKey(search: SearchParams) {
  return inventoryFilterParameters(search).toString() || "all";
}

export function pageLink(search: SearchParams, page: number) {
  const parameters = inventoryFilterParameters(search);
  if (search.bulk === "1") {
    parameters.set("bulk", "1");
  }
  const sort = currentSort(search);
  if (sort) {
    parameters.set("sort", sort.field);
    parameters.set("direction", sort.direction);
  }
  if (page > 1) {
    parameters.set("page", String(page));
  }
  const query = parameters.toString();
  return query ? `/dashboard/inventory?${query}` : "/dashboard/inventory";
}

export function sortLink(search: SearchParams, field: SortField) {
  const activeSort = currentSort(search);
  const direction: SortDirection =
    activeSort?.field === field && activeSort.direction === "asc" ? "desc" : "asc";
  return pageLink({ ...search, direction, sort: field }, 1);
}

// Keep one value per parameter, so a repeated query-string key never breaks the page.
export function normalizeSearch(raw: RawSearchParams): SearchParams {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, firstParam(value)]),
  ) as SearchParams;
}
