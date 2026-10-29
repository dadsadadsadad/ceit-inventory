export const metadata = { title: "Inventory · CEIT Inventory" };

import Link from "next/link";
import { cookies } from "next/headers";
import { ItemCondition, ItemStatus } from "@prisma/client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { humanizeEnum } from "@/lib/labels";
import { pageParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { bulkUpdateInventory } from "./actions/bulk";
import { ClearInventorySelection } from "./bulk-selection-toggle";
import { InventoryBulkActions } from "./inventory-bulk-actions";
import { InventoryFilters } from "./inventory-filters";
import {
  currentSort,
  inventoryListSelect,
  inventoryOrderBy,
  inventoryViewCookie,
  inventoryViewOf,
  inventoryWhere,
  maxBulkSelection,
  normalizeSearch,
  pageSize,
  selectionKey,
  type InventoryListItem,
  type RawSearchParams,
} from "./inventory-query";
import { InventoryRecords } from "./inventory-records";
import { InventoryRowNavigation } from "./inventory-row-navigation";
import { InventoryTabs } from "./inventory-tabs";
import { PackageSearch } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";

export const dynamic = "force-dynamic";

function InventoryFormContainer({
  canManage,
  children,
}: {
  canManage: boolean;
  children: React.ReactNode;
}) {
  if (!canManage) {
    return <>{children}</>;
  }
  return (
    <FeedbackForm action={bulkUpdateInventory} optimisticInventoryBulk className="space-y-3">
      {children}
    </FeedbackForm>
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [user, rawSearch, cookieStore] = await Promise.all([
    requireInventoryAccess(),
    searchParams,
    cookies(),
  ]);
  const normalized = normalizeSearch(rawSearch);
  // url first, then the saved view
  const view = inventoryViewOf(normalized.view ?? cookieStore.get(inventoryViewCookie)?.value);
  const search = { ...normalized, view };
  const canManage = canManageInventory(user.role);
  const bulkMode = canManage && search.bulk === "1";
  const where = inventoryWhere(search);
  const sort = currentSort(search);
  const requestedPage = pageParam(search.page);
  let databaseError = false;
  let locations: { id: string; name: string }[] = [];
  let categories: { id: string; name: string }[] = [];
  let totalRecords = 0;
  let inventoryItems: InventoryListItem[] = [];
  let allMatchingItemIds: string[] = [];
  let currentPage = requestedPage;
  const loadPage = (page: number) =>
    prisma.inventoryItem.findMany({
      where,
      orderBy: inventoryOrderBy(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: inventoryListSelect,
    });

  try {
    const [availableLocations, availableCategories, recordCount, matchingItemIds, requestedItems] =
      await Promise.all([
        prisma.location.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.category.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.inventoryItem.count({ where }),
        bulkMode
          ? prisma.inventoryItem.findMany({
              where,
              orderBy: { id: "asc" },
              select: { id: true },
              take: maxBulkSelection,
            })
          : Promise.resolve([]),
        loadPage(requestedPage),
      ]);
    locations = availableLocations;
    categories = availableCategories;
    totalRecords = recordCount;
    allMatchingItemIds = matchingItemIds.map((item) => item.id);
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    inventoryItems = currentPage === requestedPage ? requestedItems : await loadPage(currentPage);
  } catch (error) {
    console.error("Unable to load inventory list", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const persistentSelectionKey = selectionKey(search);

  return (
    <div className="page inventory-page">
      <InventoryRowNavigation />
      {search.bulk === "updated" || search.bulk === "deleted" ? <ClearInventorySelection /> : null}
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="title text-3xl sm:text-4xl">Inventory</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">All equipment and stock.</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/inventory/labels"
                className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
              >
                Print QR labels
              </Link>
              <Link
                href="/dashboard/inventory/import"
                className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
              >
                Import file
              </Link>
              <Link
                href="/dashboard/inventory/new"
                className="primary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
              >
                Add item
              </Link>
            </div>
          ) : null}
        </header>

        <InventoryTabs current="inventory" />

        <InventoryFilters
          bulkMode={bulkMode}
          categories={categories}
          locations={locations}
          search={search}
        />

        {search.bulk === "updated" ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Updated.
          </div>
        ) : null}
        {search.bulk === "deleted" ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Deleted.
          </div>
        ) : null}

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            Couldn&apos;t load the inventory.
          </div>
        ) : inventoryItems.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No items found.">
            {canManage ? "Add an item or import a file." : "Try clearing a filter."}
          </EmptyState>
        ) : (
          <InventoryFormContainer canManage={bulkMode}>
            {bulkMode ? (
              <InventoryBulkActions
                allItemIds={allMatchingItemIds}
                locations={locations.map((location) => ({
                  label: location.name,
                  value: location.id,
                }))}
                selectionKey={persistentSelectionKey}
                statuses={Object.values(ItemStatus)
                  .filter((status) => status !== ItemStatus.RETIRED)
                  .map((status) => ({ label: inventoryStatusLabel(status), value: status }))}
                conditions={Object.values(ItemCondition).map((condition) => ({
                  label: humanizeEnum(condition),
                  value: condition,
                }))}
              />
            ) : null}
            <InventoryRecords
              allMatchingItemIds={allMatchingItemIds}
              bulkMode={bulkMode}
              canManage={canManage}
              currentPage={currentPage}
              items={inventoryItems}
              persistentSelectionKey={persistentSelectionKey}
              search={search}
              totalPages={totalPages}
              totalRecords={totalRecords}
              view={view}
            />
          </InventoryFormContainer>
        )}
      </div>
    </div>
  );
}
