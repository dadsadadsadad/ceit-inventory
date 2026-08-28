"use client";

import { useEffect, useState } from "react";

import { addSelectionChangeListener, isSelectionChangeForKey, itemSelector, notifySelectionChange, saveSelectedItemIds, selectedItemIds, syncVisibleItemSelection, updateSelectedItem } from "./inventory-selection";

export function BulkSelectionToggle({ allItemIds, selectionKey }: { allItemIds: string[]; selectionKey: string }) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const syncSelection = () => {
      const eligibleIds = new Set(allItemIds);
      const itemIds = selectedItemIds(selectionKey).filter((itemId) => eligibleIds.has(itemId));
      if (itemIds.length !== selectedItemIds(selectionKey).length) saveSelectedItemIds(selectionKey, itemIds);
      syncVisibleItemSelection(itemIds);
      setSelectedCount(itemIds.length);
    };
    const handleChange = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(itemSelector)) {
        updateSelectedItem(selectionKey, event.target.value, event.target.checked);
      }
    };
    const handleSelectionChange = (event: Event) => {
      if (isSelectionChangeForKey(event, selectionKey)) syncSelection();
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

  const allSelected = allItemIds.length > 0 && selectedCount === allItemIds.length;
  const selectionLabel = selectedCount ? `${selectedCount} of ${allItemIds.length} selected` : `${allItemIds.length} matching items`;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-semibold" role="group" aria-label="Inventory selection controls">
      <span className="muted whitespace-nowrap font-medium">{selectionLabel}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setAllSelection(true)} disabled={!allItemIds.length || allSelected} className="secondary-button rounded-lg px-3 py-2 text-xs font-semibold disabled:pointer-events-none disabled:opacity-50" aria-label={`Select all ${allItemIds.length} matching inventory records`}>Select all</button>
        <button type="button" onClick={() => setAllSelection(false)} disabled={!selectedCount} className="secondary-button rounded-lg px-3 py-2 text-xs font-semibold disabled:pointer-events-none disabled:opacity-50" aria-label={`Deselect all ${selectedCount} selected inventory records`}>Deselect all</button>
      </div>
      <p className="sr-only" aria-live="polite">{`${selectedCount} of ${allItemIds.length} matching inventory records selected.`}</p>
    </div>
  );
}
