"use client";

import { recordInventoryLabelPrinted } from "@/app/dashboard/inventory/actions";
import { useState } from "react";

// Record the label print and open the print dialog.
export function PrintLabel({ itemId }: { itemId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function printLabel() {
    setPending(true);
    setError("");
    try {
      await recordInventoryLabelPrinted(itemId);
      window.print();
    } catch {
      setError("Couldn’t prepare the print job. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="no-print">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={printLabel}
        className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
      >
        {pending ? "Preparing…" : "Print this QR code"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
