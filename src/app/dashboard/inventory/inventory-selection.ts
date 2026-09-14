export const itemSelector = 'input[data-bulk-selection-item="true"]';
const selectionChangeEvent = "inventory-bulk-selection-change";
const selectionStoragePrefix = "ceit-inventory-selection:";
const memorySelection = new Map<string, string[]>();

function uniqueItemIds(itemIds: Iterable<string>) {
  return [...new Set([...itemIds].filter(Boolean))];
}

function inventoryItemInputs() {
  return [...document.querySelectorAll<HTMLInputElement>(itemSelector)];
}

// Restore this filter's selection from browser storage.
export function selectedItemIds(selectionKey: string) {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const saved = JSON.parse(
      window.sessionStorage.getItem(`${selectionStoragePrefix}${selectionKey}`) ?? "[]",
    );
    return Array.isArray(saved)
      ? uniqueItemIds(saved.filter((value): value is string => typeof value === "string"))
      : [];
  } catch {
    return memorySelection.get(selectionKey) ?? [];
  }
}

// Keep selected items when changing pages.
export function saveSelectedItemIds(selectionKey: string, itemIds: Iterable<string>) {
  if (typeof window === "undefined") {
    return;
  }
  const saved = uniqueItemIds(itemIds);
  memorySelection.set(selectionKey, saved);
  const storageKey = `${selectionStoragePrefix}${selectionKey}`;
  try {
    if (saved.length) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(saved));
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Selection can still work for the visible page when browser storage is
    // unavailable, such as in a restricted private-browsing session.
  }
}

// Match visible checkboxes to the saved selection.
export function syncVisibleItemSelection(itemIds: Iterable<string>) {
  const selected = new Set(itemIds);
  inventoryItemInputs().forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

// Add or remove one item from the selection.
export function updateSelectedItem(selectionKey: string, itemId: string, checked: boolean) {
  const selected = new Set(selectedItemIds(selectionKey));
  if (checked) {
    selected.add(itemId);
  } else {
    selected.delete(itemId);
  }
  const itemIds = [...selected];
  saveSelectedItemIds(selectionKey, itemIds);
  syncVisibleItemSelection(itemIds);
  notifySelectionChange(selectionKey);
}

// Tell the checkboxes and bulk toolbar to update.
export function notifySelectionChange(selectionKey: string) {
  document.dispatchEvent(new CustomEvent(selectionChangeEvent, { detail: { selectionKey } }));
}

export function isSelectionChangeForKey(event: Event, selectionKey: string) {
  return event instanceof CustomEvent && event.detail?.selectionKey === selectionKey;
}

// Listen for selection changes and return a cleanup function.
export function addSelectionChangeListener(listener: (event: Event) => void) {
  document.addEventListener(selectionChangeEvent, listener);
  return () => document.removeEventListener(selectionChangeEvent, listener);
}
