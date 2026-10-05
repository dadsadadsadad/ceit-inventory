import Link from "next/link";
import { ItemCondition, ItemStatus, ItemType } from "@prisma/client";

import { inspectionIntervalDays } from "@/lib/inventory-attention";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { humanizeEnum } from "@/lib/labels";

import {
  currentSort,
  isItemCondition,
  isItemStatus,
  isItemType,
  type SearchParams,
} from "./inventory-query";
import { isUuid } from "@/lib/ids";

type Option = { id: string; name: string };

// Search box, quick filters, and the extra filters for the inventory list.
export function InventoryFilters({
  bulkMode,
  categories,
  locations,
  search,
}: {
  bulkMode: boolean;
  categories: Option[];
  locations: Option[];
  search: SearchParams;
}) {
  const sort = currentSort(search);

  return (
    <>
      {/* Search, filter, and sort the inventory. */}
      <form
        className="card grid gap-3 rounded-lg p-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end"
        aria-label="Inventory filters"
      >
        {bulkMode ? <input type="hidden" name="bulk" value="1" /> : null}
        {sort ? (
          <>
            <input type="hidden" name="sort" value={sort.field} />
            <input type="hidden" name="direction" value={sort.direction} />
          </>
        ) : null}
        <label className="sm:col-span-2">
          <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
          <input
            name="q"
            defaultValue={search.q?.slice(0, 120) ?? ""}
            maxLength={120}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            placeholder="Name, asset tag, serial, room, MAC…"
          />
        </label>
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Status</span>
          <select
            name="status"
            defaultValue={isItemStatus(search.status) ? search.status : ""}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          >
            <option value="">All statuses</option>
            {Object.values(ItemStatus).map((status) => (
              <option key={status} value={status}>
                {inventoryStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Location</span>
          <select
            name="location"
            defaultValue={search.location && isUuid(search.location) ? search.location : ""}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <details
          className="filter-disclosure sm:col-span-2 xl:col-span-3"
          open={Boolean(
            search.category ||
            search.itemType ||
            search.condition ||
            search.attention === "1" ||
            search.checked === "overdue",
          )}
        >
          <summary className="cursor-pointer text-sm font-semibold">More filters</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Category</span>
              <select
                name="category"
                defaultValue={search.category && isUuid(search.category) ? search.category : ""}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Item type</span>
              <select
                name="itemType"
                defaultValue={isItemType(search.itemType) ? search.itemType : ""}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">All item types</option>
                {Object.values(ItemType).map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {humanizeEnum(itemType)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Attention</span>
              <select
                name="attention"
                defaultValue={search.attention === "1" ? "1" : ""}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">Any record</option>
                <option value="1">Needs attention (defective, untested, poor)</option>
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Last checked</span>
              <select
                name="checked"
                defaultValue={search.checked === "overdue" ? "overdue" : ""}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">Any time</option>
                <option value="overdue">{`Not checked in ${inspectionIntervalDays}+ days`}</option>
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Condition</span>
              <select
                name="condition"
                defaultValue={isItemCondition(search.condition) ? search.condition : ""}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">All conditions</option>
                {Object.values(ItemCondition).map((condition) => (
                  <option key={condition} value={condition}>
                    {humanizeEnum(condition)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <div className="flex gap-3">
          <button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">
            Filter
          </button>
          <Link
            href="/dashboard/inventory"
            className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Clear
          </Link>
        </div>
      </form>
    </>
  );
}
