"use client";

import { useEffect, useState } from "react";

import {
  addSelectionChangeListener,
  clearInventorySelections,
  isSelectionChangeForKey,
  itemSelector,
  notifySelectionChange,
  saveSelectedItemIds,
  selectedItemIds,
  syncVisibleItemSelection,
  updateSelectedItem,
} from "./inventory-selection";

export function ClearInventorySelection() {
  useEffect(() => {
    clearInventorySelections();
  }, []);
  return null;
}

export function BulkSelectionToggle({
  allItemIds,
  selectionKey,
  totalRecords,
}: {
  allItemIds: string[];
  selectionKey: string;
  totalRecords: number;
}) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const syncSelection = () => {
      const eligibleIds = new Set(allItemIds);
      const itemIds = selectedItemIds(selectionKey).filter((itemId) => eligibleIds.has(itemId));
      if (itemIds.length !== selectedItemIds(selectionKey).length) {
        saveSelectedItemIds(selectionKey, itemIds);
      }
      syncVisibleItemSelection(itemIds);
      setSelectedCount(itemIds.length);
    };
    const handleChange = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(itemSelector)) {
        updateSelectedItem(selectionKey, event.target.value, event.target.checked);
      }
    };
    const handleSelectionChange = (event: Event) => {
      if (isSelectionChangeForKey(event, selectionKey)) {
        syncSelection();
      }
    };

    syncSelection();
    document.addEventListener("change", handleChange);
    const removeSelectionChangeListener = addSelectionChangeListener(handleSelectionChange);
    return () => {
      document.removeEventListener("change", handleChange);
      removeSelectionChangeListener();
    };
  }, [allItemIds, selectionKey]);

  function setAllSelection(checked: boolean) {
    const itemIds = checked ? allItemIds : [];
    saveSelectedItemIds(selectionKey, itemIds);
    syncVisibleItemSelection(itemIds);
    notifySelectionChange(selectionKey);
  }

  // just the rows on this page, added to what is already picked
  function selectPage() {
    const pageIds = [...document.querySelectorAll<HTMLInputElement>(itemSelector)].map(
      (input) => input.value,
    );
    const itemIds = [...new Set([...selectedItemIds(selectionKey), ...pageIds])];
    saveSelectedItemIds(selectionKey, itemIds);
    syncVisibleItemSelection(itemIds);
    notifySelectionChange(selectionKey);
  }

  const allSelected = allItemIds.length > 0 && selectedCount === allItemIds.length;
  const hasSelectionLimit = totalRecords > allItemIds.length;
  const selectionLabel = `${selectedCount.toLocaleString()} of ${totalRecords.toLocaleString()} selected`;

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold"
      role="group"
      aria-label="Inventory selection controls"
    >
      <span className="muted whitespace-nowrap text-sm font-medium">{selectionLabel}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectPage}
          disabled={allSelected}
          className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
        >
          Select this page
        </button>
        <button
          type="button"
          onClick={() => setAllSelection(true)}
          disabled={!allItemIds.length || allSelected}
          className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Select all ${allItemIds.length} matching inventory records`}
        >
          {allSelected
            ? `All ${allItemIds.length.toLocaleString()} selected`
            : `Select all ${allItemIds.length.toLocaleString()} matching`}
        </button>
        <button
          type="button"
          onClick={() => setAllSelection(false)}
          disabled={!selectedCount}
          className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Clear all ${selectedCount} selected inventory records`}
        >
          Clear selection
        </button>
      </div>
      {hasSelectionLimit ? (
        <p className="muted w-full text-right font-medium">
          You can only select {allItemIds.length.toLocaleString()} items at a time. Narrow the
          filters.
        </p>
      ) : null}
      <p
        className="sr-only"
        aria-live="polite"
      >{`${selectedCount} of ${allItemIds.length} matching inventory records selected.`}</p>
    </div>
  );
}
