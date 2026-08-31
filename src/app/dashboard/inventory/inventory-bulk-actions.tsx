"use client";

import { useEffect, useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";
import { addSelectionChangeListener, isSelectionChangeForKey, notifySelectionChange, saveSelectedItemIds, selectedItemIds, syncVisibleItemSelection } from "./inventory-selection";

type BulkAction = "condition" | "location" | "remove" | "status";
type SelectOption = { label: string; value: string };

export function InventoryBulkActions({
  allItemIds,
  clearSelectionOnLoad = false,
  conditions,
  locations,
  selectionKey,
  statuses,
}: {
  allItemIds: string[];
  clearSelectionOnLoad?: boolean;
  conditions: SelectOption[];
  locations: SelectOption[];
  selectionKey: string;
  statuses: SelectOption[];
}) {
  const [action, setAction] = useState<BulkAction>("status");
  const [removalConfirmation, setRemovalConfirmation] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const syncSelection = () => {
      const eligibleIds = new Set(allItemIds);
      const itemIds = selectedItemIds(selectionKey).filter((itemId) => eligibleIds.has(itemId));
      if (itemIds.length !== selectedItemIds(selectionKey).length) saveSelectedItemIds(selectionKey, itemIds);
      syncVisibleItemSelection(itemIds);
      setSelectedIds(itemIds);
    };
    const handleSelectionChange = (event: Event) => {
      if (isSelectionChangeForKey(event, selectionKey)) syncSelection();
    };

    if (clearSelectionOnLoad) {
      saveSelectedItemIds(selectionKey, []);
      notifySelectionChange(selectionKey);
    }
    syncSelection();
    return addSelectionChangeListener(handleSelectionChange);
  }, [allItemIds, clearSelectionOnLoad, selectionKey]);

  function clearSelection() {
    saveSelectedItemIds(selectionKey, []);
    syncVisibleItemSelection([]);
    notifySelectionChange(selectionKey);
  }

  if (!selectedIds.length) return null;

  const countLabel = `${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"} selected`;
  const actionDetails = action === "location"
    ? "Move every selected item to one active location."
    : action === "status"
      ? "Apply one status to every selected item."
      : action === "condition"
        ? "Apply one condition to every selected item."
        : "Remove selected items from active inventory while preserving their history.";

  return (
    <section className="bulk-action-toolbar card rounded-xl p-4 sm:p-5" aria-label="Bulk actions for selected inventory items">
      {selectedIds.map((itemId) => <input key={itemId} type="hidden" name="itemIds" value={itemId} />)}
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
          <select value={action} onChange={(event) => {
            setAction(event.target.value as BulkAction);
            setRemovalConfirmation("");
          }} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
            <option value="status">Edit status</option>
            <option value="condition">Edit condition</option>
            <option value="location">Move to location</option>
            <option value="remove">Remove from active inventory</option>
          </select>
        </label>

        <div>
          <span className="muted text-xs font-bold uppercase tracking-wide">{action === "remove" ? "What this does" : "New value"}</span>
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
            <div className="mt-2 space-y-3">
              <p className="bulk-action-remove-note rounded-lg px-3 py-2.5 text-sm leading-5">{actionDetails}</p>
              <label className="block">
                <span className="muted text-xs font-bold uppercase tracking-wide">Type RETIRE to confirm</span>
                <input name="bulkRemovalConfirmation" required value={removalConfirmation} onChange={(event) => setRemovalConfirmation(event.target.value)} maxLength={16} autoComplete="off" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="RETIRE" />
              </label>
            </div>
          )}
        </div>

        <div className="xl:min-w-40">
          <input type="hidden" name="bulkAction" value={action} />
          <p className="muted mb-2 hidden text-xs leading-5 xl:block">{actionDetails}</p>
          <SubmitButton disabled={action === "remove" && removalConfirmation !== "RETIRE"} pendingLabel="Updating…" className={`${action === "remove" ? "danger-button" : "primary-button"} w-full rounded-lg px-4 py-2.5 text-sm font-semibold`}>{action === "remove" ? `Retire ${selectedIds.length}` : `Apply to ${selectedIds.length}`}</SubmitButton>
        </div>
      </div>
    </section>
  );
}
