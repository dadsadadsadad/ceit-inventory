"use client";

import { useEffect, useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";

type BulkAction = "condition" | "location" | "retire" | "status";
type SelectOption = { label: string; value: string };

const itemSelector = 'input[data-bulk-selection-item="true"]';
const selectionChangeEvent = "inventory-bulk-selection-change";

function inventoryItemInputs() {
  return [...document.querySelectorAll<HTMLInputElement>(itemSelector)];
}

function selectedItemCount() {
  return new Set(inventoryItemInputs().filter((input) => input.checked).map((input) => input.value)).size;
}

function selectableItemCount() {
  return new Set(inventoryItemInputs().map((input) => input.value)).size;
}

function syncMatchingItemSelection(source: HTMLInputElement) {
  inventoryItemInputs().forEach((input) => {
    if (input.value === source.value) input.checked = source.checked;
  });
}

function setAllItemSelection(checked: boolean) {
  inventoryItemInputs().forEach((input) => {
    input.checked = checked;
  });
  notifySelectionChange();
}

function notifySelectionChange() {
  document.dispatchEvent(new Event(selectionChangeEvent));
}

export function InventoryBulkActions({
  conditions,
  locations,
  statuses,
}: {
  conditions: SelectOption[];
  locations: SelectOption[];
  statuses: SelectOption[];
}) {
  const [action, setAction] = useState<BulkAction>("status");
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const syncSelection = () => setSelectedCount(selectedItemCount());
    const handleChange = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(itemSelector)) syncSelection();
    };

    syncSelection();
    document.addEventListener("change", handleChange);
    document.addEventListener(selectionChangeEvent, syncSelection);
    return () => {
      document.removeEventListener("change", handleChange);
      document.removeEventListener(selectionChangeEvent, syncSelection);
    };
  }, []);

  function clearSelection() {
    setAllItemSelection(false);
  }

  if (!selectedCount) return null;

  const countLabel = `${selectedCount} item${selectedCount === 1 ? "" : "s"} selected`;
  const actionDetails = action === "location"
    ? "Move every selected item to one active location."
    : action === "status"
      ? "Apply one status to every selected item."
      : action === "condition"
        ? "Apply one condition to every selected item."
        : "Retire selected items from active inventory while preserving their history.";

  return (
    <section className="bulk-action-toolbar card rounded-xl p-4 sm:p-5" aria-label="Bulk actions for selected inventory items">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-xl">
          <p className="eyebrow">Selected inventory</p>
          <h2 className="mt-2 text-lg font-bold tracking-tight">{countLabel}</h2>
          <p className="muted mt-1 text-sm leading-6">Choose one focused action to apply across your current selection.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={clearSelection} className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold">Clear selection</button>
        </div>
      </div>

      <div className="bulk-action-toolbar-controls mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(13rem,0.9fr)_minmax(15rem,1fr)_auto] xl:items-end">
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Action</span>
          <select value={action} onChange={(event) => setAction(event.target.value as BulkAction)} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
            <option value="status">Edit status</option>
            <option value="condition">Edit condition</option>
            <option value="location">Move to location</option>
            <option value="retire">Retire selected items</option>
          </select>
        </label>

        <div>
          <span className="muted text-xs font-bold uppercase tracking-wide">{action === "retire" ? "What this does" : "New value"}</span>
          {action === "location" ? (
            <select required name="bulkLocationId" defaultValue="" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" aria-label="New location">
              <option value="" disabled>Choose an active location</option>
              {locations.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}
            </select>
          ) : action === "status" ? (
            <select name="bulkStatus" defaultValue={statuses[0]?.value} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" aria-label="New status">
              {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          ) : action === "condition" ? (
            <select name="bulkCondition" defaultValue={conditions[0]?.value} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" aria-label="New condition">
              {conditions.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
            </select>
          ) : (
            <p className="bulk-action-retire-note mt-2 rounded-lg px-3 py-2.5 text-sm leading-5">{actionDetails}</p>
          )}
        </div>

        <div className="xl:min-w-40">
          <input type="hidden" name="bulkAction" value={action} />
          <p className="muted mb-2 hidden text-xs leading-5 xl:block">{actionDetails}</p>
          <SubmitButton pendingLabel="Updating…" className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold">Apply to {selectedCount}</SubmitButton>
        </div>
      </div>
    </section>
  );
}

export { itemSelector, notifySelectionChange, selectableItemCount, selectedItemCount, setAllItemSelection, syncMatchingItemSelection };
