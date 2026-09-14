"use client";
import { useState } from "react";
import { Printer } from "lucide-react";
import { recordLabelSheetPrinted } from "./actions";

// Record the selected labels before printing.
export function PrintSheet({ ids }: { ids: string[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function print() {
    setPending(true);
    setError("");
    try {
      await recordLabelSheetPrinted(ids);
      window.print();
    } catch {
      setError("Couldn’t prepare the print job. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={print}
        className="primary-button gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
      >
        <Printer size={16} aria-hidden="true" />
        {pending ? "Preparing…" : "Print labels"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
