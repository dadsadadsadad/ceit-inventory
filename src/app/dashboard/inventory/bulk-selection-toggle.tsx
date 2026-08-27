"use client";

import { useEffect, useState } from "react";

import { itemSelector, notifySelectionChange, selectableItemCount, selectedItemCount, setAllItemSelection, syncMatchingItemSelection } from "./inventory-bulk-actions";

export function BulkSelectionToggle() {
  const [itemCount, setItemCount] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const syncSelection = () => {
      setItemCount(selectableItemCount());
      setSelectedCount(selectedItemCount());
    };
    const handleChange = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(itemSelector)) {
        syncMatchingItemSelection(event.target);
        syncSelection();
        notifySelectionChange();
      }
    };

    syncSelection();
    document.addEventListener("change", handleChange);
    document.addEventListener("inventory-bulk-selection-change", syncSelection);
    return () => {
      document.removeEventListener("change", handleChange);
      document.removeEventListener("inventory-bulk-selection-change", syncSelection);
    };
  }, []);

  function setPageSelection(checked: boolean) {
    setAllItemSelection(checked);
  }

  const allSelected = itemCount > 0 && selectedCount === itemCount;
  const selectionLabel = selectedCount ? `${selectedCount} of ${itemCount} selected` : `${itemCount} on this page`;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-semibold" role="group" aria-label="Inventory selection controls">
      <span className="muted whitespace-nowrap font-medium">{selectionLabel}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPageSelection(true)} disabled={!itemCount || allSelected} className="secondary-button rounded-lg px-3 py-2 text-xs font-semibold disabled:pointer-events-none disabled:opacity-50" aria-label={`Select all ${itemCount} inventory records on this page`}>Select all</button>
        <button type="button" onClick={() => setPageSelection(false)} disabled={!selectedCount} className="secondary-button rounded-lg px-3 py-2 text-xs font-semibold disabled:pointer-events-none disabled:opacity-50" aria-label={`Deselect all ${selectedCount} selected inventory records`}>Deselect all</button>
      </div>
      <p className="sr-only" aria-live="polite">{`${selectedCount} of ${itemCount} inventory records selected.`}</p>
    </div>
  );
}
