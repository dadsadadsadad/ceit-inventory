"use client";

import { recordInventoryLabelPrinted } from "@/app/dashboard/inventory/actions";

export function PrintLabel({ itemId }: { itemId: string }) {
  function printLabel() {
    void recordInventoryLabelPrinted(itemId).catch(() => {
      // Printing remains available if the optional activity entry cannot be saved.
    });
    window.print();
  }

  return <button type="button" onClick={printLabel} className="primary-button no-print rounded-lg px-4 py-2.5 text-sm font-semibold">Print this label</button>;
}
