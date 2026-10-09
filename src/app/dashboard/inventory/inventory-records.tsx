import Link from "next/link";
import { Monitor, Package } from "lucide-react";

import { OptimisticStatus, OptimisticText } from "@/app/components/optimistic-state";
import { Pager } from "@/app/components/pager";
import { StockBadge } from "@/app/components/stock-badge";
import { formatManilaDate } from "@/lib/manila-date";

import { BulkSelectionToggle } from "./bulk-selection-toggle";
import {
  currentSort,
  pageLink,
  sortLink,
  type InventoryListItem,
  type SearchParams,
  type SortField,
} from "./inventory-query";

function lastCheckedLabel(value: Date | null) {
  return value
    ? formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" })
    : "Not checked";
}

// Link a table heading to its next sort order.
function SortableHeader({
  field,
  label,
  search,
}: {
  field: SortField;
  label: string;
  search: SearchParams;
}) {
  const activeSort = currentSort(search);
  const isActive = activeSort?.field === field;
  const direction = activeSort?.direction === "desc" ? "descending" : "ascending";
  const marker = isActive ? (activeSort?.direction === "desc" ? "↓" : "↑") : "↕";

  return (
    <th
      scope="col"
      aria-sort={isActive ? direction : "none"}
      className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
    >
      <Link
        href={sortLink(search, field)}
        className="inline-flex items-center gap-1.5 hover:text-[var(--accent)]"
        aria-label={`Sort by ${label}${isActive ? `, currently ${direction}` : ""}`}
      >
        {label}
        <span className={isActive ? "text-[var(--accent)]" : "opacity-45"} aria-hidden="true">
          {marker}
        </span>
      </Link>
    </th>
  );
}

// The matching records as mobile cards and a desktop table, with paging.
export function InventoryRecords({
  allMatchingItemIds,
  bulkMode,
  canManage,
  currentPage,
  items,
  persistentSelectionKey,
  search,
  totalPages,
  totalRecords,
}: {
  allMatchingItemIds: string[];
  bulkMode: boolean;
  canManage: boolean;
  currentPage: number;
  items: InventoryListItem[];
  persistentSelectionKey: string;
  search: SearchParams;
  totalPages: number;
  totalRecords: number;
}) {
  const inventoryItems = items;

  return (
    <>
      {/* Matching inventory records. */}
      <section className="card overflow-hidden rounded-lg" aria-label="Inventory records">
        <div className="divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <p className="muted text-sm">
            {totalRecords.toLocaleString()} record{totalRecords === 1 ? "" : "s"} · Page{" "}
            {currentPage} of {totalPages}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {bulkMode ? (
              <BulkSelectionToggle
                allItemIds={allMatchingItemIds}
                selectionKey={persistentSelectionKey}
                totalRecords={totalRecords}
              />
            ) : null}
            {canManage ? (
              <Link
                href={pageLink({ ...search, bulk: bulkMode ? undefined : "1" }, currentPage)}
                className="accent-link text-sm font-semibold"
              >
                {bulkMode ? "Done selecting" : "Select items"}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="record-cards divide-y xl:hidden">
          {inventoryItems.map((item) => {
            return (
              <article
                key={item.id}
                data-inventory-row-url={`/dashboard/inventory/${item.id}`}
                tabIndex={0}
                aria-label={`Open ${item.name}`}
                className="cursor-pointer space-y-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
              >
                {/* Compact item cards for mobile. */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/dashboard/inventory/${item.id}`}
                      className="accent-link record-name font-semibold"
                    >
                      <OptimisticText entity={`item:${item.id}`} field="name">
                        {item.name}
                      </OptimisticText>
                    </Link>
                    <p className="muted mt-1 text-xs">
                      {item.category.name}
                      {item.computer ? " · PC" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <OptimisticStatus entity={`item:${item.id}`} value={item.status} />
                    {bulkMode ? (
                      <input
                        value={item.id}
                        type="checkbox"
                        data-bulk-selection-item="true"
                        className="h-4 w-4"
                        aria-label={`Select ${item.name}`}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p className="muted asset-code">{item.assetTag ?? "No asset tag"}</p>
                  <p className="text-right">
                    <OptimisticText entity={`item:${item.id}`} field="location">
                      {item.location.name}
                    </OptimisticText>
                  </p>
                  <p className="muted">
                    {item.itemType === "SUPPLY" ? `${item.quantity} in stock` : "1 unit"} ·{" "}
                    {lastCheckedLabel(item.lastCheckedAt)}
                  </p>
                  <p className="text-right">
                    <StockBadge item={item} />
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="record-table hidden overflow-x-auto xl:block">
          {/* Inventory table for wider screens. */}
          <table className="w-full">
            <thead>
              <tr className="table-heading divider border-b">
                {bulkMode ? (
                  <th scope="col" className="w-12 px-3 py-4">
                    <span className="sr-only">Select</span>
                  </th>
                ) : null}
                <SortableHeader field="assetTag" label="Asset tag" search={search} />
                <SortableHeader field="item" label="Item" search={search} />
                <SortableHeader field="location" label="Location" search={search} />
                <SortableHeader field="stock" label="Stock" search={search} />
                <SortableHeader field="status" label="Status" search={search} />
                <th
                  scope="col"
                  className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
                >
                  Last checked
                </th>
              </tr>
            </thead>
            <tbody>
              {inventoryItems.map((item) => {
                return (
                  <tr
                    key={item.id}
                    data-inventory-row-url={`/dashboard/inventory/${item.id}`}
                    tabIndex={0}
                    aria-label={`Open ${item.name}`}
                    className="table-row cursor-pointer border-b last:border-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
                  >
                    {bulkMode ? (
                      <td className="px-3 py-4">
                        <input
                          value={item.id}
                          type="checkbox"
                          data-bulk-selection-item="true"
                          className="h-4 w-4"
                          aria-label={`Select ${item.name}`}
                        />
                      </td>
                    ) : null}
                    <td className="record-tag muted asset-code px-5 py-4 text-sm">
                      {item.assetTag ?? "–"}
                    </td>
                    <td className="record-item px-5 py-4 text-sm">
                      <div className="record-identity">
                        <span
                          className={`record-symbol ${item.computer ? "is-computer" : ""}`}
                          aria-hidden="true"
                        >
                          {item.computer ? <Monitor size={21} /> : <Package size={21} />}
                        </span>
                        <div>
                          <Link
                            href={`/dashboard/inventory/${item.id}`}
                            className="accent-link record-name font-semibold"
                          >
                            <OptimisticText entity={`item:${item.id}`} field="name">
                              {item.name}
                            </OptimisticText>
                          </Link>
                          <div className="muted mt-1 text-xs">
                            {item.category.name}
                            {item.computer ? " · PC" : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="record-location muted px-5 py-4 text-sm">
                      <OptimisticText entity={`item:${item.id}`} field="location">
                        {item.location.name}
                      </OptimisticText>
                    </td>
                    <td className="px-5 py-4 text-sm">
                      <span className="stock-cell">
                        <span className="muted">{item.quantity.toLocaleString()}</span>
                        <StockBadge item={item} />
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <OptimisticStatus entity={`item:${item.id}`} value={item.status} />
                    </td>
                    <td className="record-checked muted px-5 py-4 text-sm">
                      {lastCheckedLabel(item.lastCheckedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pager
          label="Inventory"
          currentPage={currentPage}
          totalPages={totalPages}
          hrefForPage={(page) => pageLink(search, page)}
        />
      </section>
    </>
  );
}
