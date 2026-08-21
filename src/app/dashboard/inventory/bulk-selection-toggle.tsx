"use client";

export function BulkSelectionToggle() {
  function setPageSelection(checked: boolean) {
    document.querySelectorAll<HTMLInputElement>('input[data-bulk-selection-item="true"]').forEach((input) => {
      input.checked = checked;
    });
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
      <input type="checkbox" onChange={(event) => setPageSelection(event.currentTarget.checked)} className="h-4 w-4" />
      Select this page
    </label>
  );
}
