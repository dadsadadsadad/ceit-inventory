import Link from "next/link";

import { ItemCondition, ItemStatus, ItemType, Prisma } from "@prisma/client";

import { inventoryStatusClass, inventoryStatusLabel } from "@/lib/inventory-status";
import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { formatManilaDate } from "@/lib/manila-date";
import { prisma } from "@/prisma";

import { FeedbackForm } from "@/app/components/feedback-form";
import { bulkUpdateInventory } from "./actions";
import { BulkSelectionToggle } from "./bulk-selection-toggle";
import { InventoryBulkActions } from "./inventory-bulk-actions";
import { InventoryRowNavigation } from "./inventory-row-navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  bulk?: string;
  category?: string;
  condition?: string;
  direction?: string;
  itemType?: string;
  location?: string;
  page?: string;
  q?: string;
  sort?: string;
  status?: string;
};
type InventoryListItem = Prisma.InventoryItemGetPayload<{ include: { category: true; computer: true; location: true } }>;
type SortDirection = "asc" | "desc";
type SortField = "assetTag" | "item" | "location" | "stock" | "status";

const pageSize = 25;
const maximumBulkSelection = 10_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sortableFields: SortField[] = ["assetTag", "item", "location", "stock", "status"];

function isItemStatus(value?: string): value is ItemStatus {
  return Boolean(value && Object.values(ItemStatus).includes(value as ItemStatus));
}

function isItemType(value?: string): value is ItemType {
  return Boolean(value && Object.values(ItemType).includes(value as ItemType));
}

function isItemCondition(value?: string): value is ItemCondition {
  return Boolean(value && Object.values(ItemCondition).includes(value as ItemCondition));
}

function enumLabel(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function lastCheckedLabel(value: Date | null) {
  return value ? formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" }) : "Not checked";
}

function safePage(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function inventoryWhere(search: SearchParams) {
  const q = search.q?.trim().slice(0, 120);
  const where: Prisma.InventoryItemWhereInput = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { assetTag: { contains: q, mode: "insensitive" } },
      { serialNumber: { contains: q, mode: "insensitive" } },
      { manufacturer: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { category: { name: { contains: q, mode: "insensitive" } } },
      { location: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (isItemStatus(search.status)) where.status = search.status;
  if (search.location && uuidPattern.test(search.location)) where.locationId = search.location;
  if (search.category && uuidPattern.test(search.category)) where.categoryId = search.category;
  if (isItemType(search.itemType)) where.itemType = search.itemType;
  if (isItemCondition(search.condition)) where.condition = search.condition;
  return where;
}

function currentSort(search: SearchParams): { direction: SortDirection; field: SortField } | null {
  const field = sortableFields.find((candidate) => candidate === search.sort);
  if (!field) return null;
  return { field, direction: search.direction === "desc" ? "desc" : "asc" };
}

function inventoryOrderBy(sort: ReturnType<typeof currentSort>): Prisma.InventoryItemOrderByWithRelationInput[] {
  if (!sort) return [{ updatedAt: "desc" }, { id: "asc" }];

  switch (sort.field) {
    case "assetTag": return [{ assetTag: sort.direction }, { id: "asc" }];
    case "item": return [{ name: sort.direction }, { id: "asc" }];
    case "location": return [{ location: { name: sort.direction } }, { id: "asc" }];
    case "stock": return [{ quantity: sort.direction }, { id: "asc" }];
    case "status": return [{ status: sort.direction }, { id: "asc" }];
  }
}

function inventoryFilterParameters(search: SearchParams) {
  const parameters = new URLSearchParams();
  if (search.q?.trim()) parameters.set("q", search.q.trim().slice(0, 120));
  if (isItemStatus(search.status)) parameters.set("status", search.status);
  if (search.location && uuidPattern.test(search.location)) parameters.set("location", search.location);
  if (search.category && uuidPattern.test(search.category)) parameters.set("category", search.category);
  if (isItemType(search.itemType)) parameters.set("itemType", search.itemType);
  if (isItemCondition(search.condition)) parameters.set("condition", search.condition);
  return parameters;
}

function selectionKey(search: SearchParams) {
  return inventoryFilterParameters(search).toString() || "all";
}

function pageLink(search: SearchParams, page: number) {
  const parameters = inventoryFilterParameters(search);
  const sort = currentSort(search);
  if (sort) {
    parameters.set("sort", sort.field);
    parameters.set("direction", sort.direction);
  }
  if (page > 1) parameters.set("page", String(page));
  const query = parameters.toString();
  return query ? `/dashboard/inventory?${query}` : "/dashboard/inventory";
}

function sortLink(search: SearchParams, field: SortField) {
  const activeSort = currentSort(search);
  const direction: SortDirection = activeSort?.field === field && activeSort.direction === "asc" ? "desc" : "asc";
  return pageLink({ ...search, direction, sort: field }, 1);
}

function SortableHeader({ field, label, search }: { field: SortField; label: string; search: SearchParams }) {
  const activeSort = currentSort(search);
  const isActive = activeSort?.field === field;
  const direction = activeSort?.direction === "desc" ? "descending" : "ascending";
  const marker = isActive ? activeSort?.direction === "desc" ? "↓" : "↑" : "↕";

  return (
    <th scope="col" aria-sort={isActive ? direction : "none"} className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">
      <Link href={sortLink(search, field)} className="inline-flex items-center gap-1.5 hover:text-[var(--accent)]" aria-label={`Sort by ${label}${isActive ? `, currently ${direction}` : ""}`}>
        {label}<span className={isActive ? "text-[var(--accent)]" : "opacity-45"} aria-hidden="true">{marker}</span>
      </Link>
    </th>
  );
}

function paginationEntries(totalPages: number, currentPage: number) {
  const pages = new Set<number>([1, totalPages]);

  if (totalPages <= 9) {
    for (let page = 1; page <= totalPages; page += 1) pages.add(page);
  } else {
    const start = currentPage <= 3 ? 1 : currentPage >= totalPages - 2 ? totalPages - 4 : currentPage - 2;
    const end = currentPage <= 3 ? 5 : currentPage >= totalPages - 2 ? totalPages : currentPage + 2;
    for (let page = start; page <= end; page += 1) pages.add(page);
  }

  const sortedPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((left, right) => left - right);
  return sortedPages.flatMap((page, index) => index > 0 && page - sortedPages[index - 1] > 1 ? [null, page] : [page]);
}

function ItemActions({ canManage, itemId }: { canManage: boolean; itemId: string }) {
  return (
    <div className="flex items-center justify-end gap-3 text-sm font-semibold">
      <Link href={`/dashboard/inventory/${itemId}/label`} className="accent-link">QR code</Link>
      {canManage ? <Link href={`/dashboard/inventory/${itemId}#edit-record`} className="accent-link">Edit</Link> : null}
    </div>
  );
}

function InventoryFormContainer({ canManage, children }: { canManage: boolean; children: React.ReactNode }) {
  if (!canManage) return <>{children}</>;
  return <FeedbackForm action={bulkUpdateInventory} className="space-y-3">{children}</FeedbackForm>;
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [user, search] = await Promise.all([
    requireInventoryAccess(),
    searchParams,
  ]);
  const canManage = canManageInventory(user.role);
  const where = inventoryWhere(search);
  const sort = currentSort(search);
  const requestedPage = safePage(search.page);
  let databaseError = false;
  let locations: { id: string; name: string }[] = [];
  let categories: { id: string; name: string }[] = [];
  let totalRecords = 0;
  let inventoryItems: InventoryListItem[] = [];
  let allMatchingItemIds: string[] = [];
  let currentPage = requestedPage;

  try {
    const [availableLocations, availableCategories, recordCount, matchingItemIds] = await Promise.all([
      prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.inventoryItem.count({ where }),
      canManage ? prisma.inventoryItem.findMany({ where, orderBy: { id: "asc" }, select: { id: true }, take: maximumBulkSelection }) : Promise.resolve([]),
    ]);
    locations = availableLocations;
    categories = availableCategories;
    totalRecords = recordCount;
    allMatchingItemIds = matchingItemIds.map((item) => item.id);
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    inventoryItems = await prisma.inventoryItem.findMany({
      where,
      orderBy: inventoryOrderBy(sort),
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: { category: true, computer: true, location: true },
    });
  } catch (error) {
    console.error("Unable to load inventory list", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const persistentSelectionKey = selectionKey(search);

  return (
    <div className="page inventory-page">
      <InventoryRowNavigation />
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Inventory</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Item register</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">Track individually tagged CEIT equipment, supplies, inspections, and the hardware and software assigned to each PC or Mac.</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/inventory/import" className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Import file</Link>
              <Link href="/dashboard/inventory/new" className="primary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Add inventory item</Link>
            </div>
          ) : null}
        </header>

        <form className="card grid gap-3 rounded-lg p-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end" aria-label="Inventory filters">
          {sort ? <><input type="hidden" name="sort" value={sort.field} /><input type="hidden" name="direction" value={sort.direction} /></> : null}
          <label className="sm:col-span-2">
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input name="q" defaultValue={search.q?.slice(0, 120) ?? ""} maxLength={120} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Name, asset tag, serial, room…" />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Status</span>
            <select name="status" defaultValue={isItemStatus(search.status) ? search.status : ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="">All statuses</option>
              {Object.values(ItemStatus).map((status) => <option key={status} value={status}>{inventoryStatusLabel(status)}</option>)}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Location</span>
            <select name="location" defaultValue={search.location && uuidPattern.test(search.location) ? search.location : ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="">All locations</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Category</span>
            <select name="category" defaultValue={search.category && uuidPattern.test(search.category) ? search.category : ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Item type</span>
            <select name="itemType" defaultValue={isItemType(search.itemType) ? search.itemType : ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="">All item types</option>
              {Object.values(ItemType).map((itemType) => <option key={itemType} value={itemType}>{enumLabel(itemType)}</option>)}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Condition</span>
            <select name="condition" defaultValue={isItemCondition(search.condition) ? search.condition : ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="">All conditions</option>
              {Object.values(ItemCondition).map((condition) => <option key={condition} value={condition}>{enumLabel(condition)}</option>)}
            </select>
          </label>
          <div className="flex gap-3">
            <button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Filter</button>
            <Link href="/dashboard/inventory" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Clear</Link>
          </div>
        </form>

        {search.bulk === "updated" ? <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">The selected inventory records were updated.</div> : null}
        {search.bulk === "deleted" ? <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">The selected inventory records were permanently deleted.</div> : null}

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">Inventory could not be loaded. Confirm the database connection and try again.</div>
        ) : inventoryItems.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">No records match these filters. {canManage ? "Add an item or import an existing file to get started." : "Try clearing a filter."}</div>
        ) : (
          <InventoryFormContainer canManage={canManage}>
            {canManage ? <InventoryBulkActions allItemIds={allMatchingItemIds} canPermanentlyDelete={canManageAdministration(user.role)} clearSelectionOnLoad={search.bulk === "updated" || search.bulk === "deleted"} locations={locations.map((location) => ({ label: location.name, value: location.id }))} selectionKey={persistentSelectionKey} statuses={Object.values(ItemStatus).filter((status) => status !== ItemStatus.RETIRED).map((status) => ({ label: inventoryStatusLabel(status), value: status }))} conditions={Object.values(ItemCondition).map((condition) => ({ label: enumLabel(condition), value: condition }))} /> : null}
          <section className="card overflow-hidden rounded-lg" aria-label="Inventory records">
            <div className="divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <p className="muted text-sm">{totalRecords.toLocaleString()} record{totalRecords === 1 ? "" : "s"} · Page {currentPage} of {totalPages}</p>
              {canManage ? <BulkSelectionToggle allItemIds={allMatchingItemIds} selectionKey={persistentSelectionKey} totalRecords={totalRecords} /> : null}
            </div>

            <div className="divide-y md:hidden">
              {inventoryItems.map((item) => {
                return (
                  <article key={item.id} data-inventory-row-url={`/dashboard/inventory/${item.id}`} tabIndex={0} aria-label={`Open ${item.name}`} className="cursor-pointer space-y-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/dashboard/inventory/${item.id}`} className="accent-link font-semibold">{item.name}</Link>
                        <p className="muted mt-1 text-xs">{item.category.name}{item.computer ? " · PC" : ""}</p>
                      </div>
                      <div className="flex items-center gap-2"><span className={`${inventoryStatusClass(item.status)} shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold`}>{inventoryStatusLabel(item.status)}</span>{canManage ? <input value={item.id} type="checkbox" data-bulk-selection-item="true" className="h-4 w-4" aria-label={`Select ${item.name}`} /> : null}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p className="muted">{item.assetTag ?? "No asset tag"}</p>
                      <p className="text-right">{item.location.name}</p>
                      <p className="muted">{item.quantity} · {lastCheckedLabel(item.lastCheckedAt)}</p>
                      <ItemActions canManage={canManage} itemId={item.id} />
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead>
                  <tr className="table-heading divider border-b">
                    {canManage ? <th scope="col" className="w-12 px-3 py-4"><span className="sr-only">Select</span></th> : null}
                    <SortableHeader field="assetTag" label="Asset tag" search={search} />
                    <SortableHeader field="item" label="Item" search={search} />
                    <SortableHeader field="location" label="Location" search={search} />
                    <SortableHeader field="stock" label="Stock" search={search} />
                    <SortableHeader field="status" label="Status" search={search} />
                    <th scope="col" className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">Last checked</th>
                    <th scope="col" className="px-5 py-4 text-right text-xs font-bold uppercase tracking-[0.16em]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryItems.map((item) => {
                    return (
                      <tr key={item.id} data-inventory-row-url={`/dashboard/inventory/${item.id}`} tabIndex={0} aria-label={`Open ${item.name}`} className="table-row cursor-pointer border-b last:border-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]">
                        {canManage ? <td className="px-3 py-4"><input value={item.id} type="checkbox" data-bulk-selection-item="true" className="h-4 w-4" aria-label={`Select ${item.name}`} /></td> : null}
                        <td className="muted px-5 py-4 text-sm">{item.assetTag ?? "–"}</td>
                        <td className="px-5 py-4 text-sm"><Link href={`/dashboard/inventory/${item.id}`} className="accent-link font-semibold">{item.name}</Link><div className="muted mt-1 text-xs">{item.category.name}{item.computer ? " · PC" : ""}</div></td>
                        <td className="muted px-5 py-4 text-sm">{item.location.name}</td>
                        <td className="muted px-5 py-4 text-sm">{item.quantity}</td>
                        <td className="px-5 py-4"><span className={`${inventoryStatusClass(item.status)} rounded-md px-2.5 py-1 text-xs font-semibold`}>{inventoryStatusLabel(item.status)}</span></td>
                        <td className="muted px-5 py-4 text-sm">{lastCheckedLabel(item.lastCheckedAt)}</td>
                        <td className="px-5 py-4"><ItemActions canManage={canManage} itemId={item.id} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav className="divider flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" aria-label="Inventory pages">
                {currentPage > 1 ? <Link href={pageLink(search, currentPage - 1)} className="pagination-link px-3 text-sm font-semibold">← Previous</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">← Previous</span>}
                <div className="order-3 flex w-full items-center justify-center gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0" aria-label="Choose inventory page">
                  {paginationEntries(totalPages, currentPage).map((entry, index) => entry === null ? (
                    <span key={`gap-${index}`} className="muted px-1 text-sm" aria-hidden="true">…</span>
                  ) : entry === currentPage ? (
                    <span key={entry} className="pagination-current text-sm font-semibold" aria-current="page">{entry}</span>
                  ) : (
                    <Link key={entry} href={pageLink(search, entry)} className="pagination-link text-sm font-semibold" aria-label={`Go to page ${entry}`}>{entry}</Link>
                  ))}
                </div>
                {currentPage < totalPages ? <Link href={pageLink(search, currentPage + 1)} className="pagination-link px-3 text-sm font-semibold">Next →</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">Next →</span>}
              </nav>
            ) : null}
          </section>
          </InventoryFormContainer>
        )}
      </div>
    </div>
  );
}
