export const metadata = { title: "Inventory · CEIT Inventory" };

import Link from "next/link";
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
  inventoryWhere,
  maximumBulkSelection,
  normalizeSearch,
  pageSize,
  selectionKey,
  type InventoryListItem,
  type RawSearchParams,
} from "./inventory-query";
import { InventoryRecords } from "./inventory-records";
import { InventoryRowNavigation } from "./inventory-row-navigation";
import { InventoryTabs } from "./inventory-tabs";

export const dynamic = "force-dynamic";

// Wrap bulk changes in a form when editing is allowed.
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

// Load the filtered inventory list.
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [user, rawSearch] = await Promise.all([requireInventoryAccess(), searchParams]);
  const search = normalizeSearch(rawSearch);
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
              take: maximumBulkSelection,
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
        {/* Inventory title and add/import links. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Equipment register</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Inventory</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Find equipment, check its condition, and keep each record up to date.
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <details className="secondary-actions">
                <summary className="secondary-button cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold">
                  Inventory tools
                </summary>
                <div className="secondary-actions-menu">
                  <Link href="/dashboard/inventory/labels">Print QR labels</Link>
                  <Link href="/dashboard/inventory/import">Import file</Link>
                </div>
              </details>
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
            The selected inventory records were updated.
          </div>
        ) : null}
        {search.bulk === "deleted" ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            The selected inventory records were permanently deleted.
          </div>
        ) : null}

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            Inventory could not be loaded. Confirm the database connection and try again.
          </div>
        ) : inventoryItems.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">
            No records match these filters.{" "}
            {canManage
              ? "Add an item or import an existing file to get started."
              : "Try clearing a filter."}
          </div>
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
            />
          </InventoryFormContainer>
        )}
      </div>
    </div>
  );
}
