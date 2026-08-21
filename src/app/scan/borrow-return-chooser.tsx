"use client";

import { useState } from "react";

import { BorrowRequestForm } from "./borrow-request-form";
import { ReturnRequestForm } from "./return-request-form";

type RequestMode = "borrow" | "return" | null;

type BorrowReturnChooserProps = {
  borrowable: boolean;
  itemName: string;
  maximumQuantity: number;
  qrCode: string;
};

export function BorrowReturnChooser({ borrowable, itemName, maximumQuantity, qrCode }: BorrowReturnChooserProps) {
  const [mode, setMode] = useState<RequestMode>(null);

  if (mode === "borrow") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setMode(null)} className="accent-link text-sm font-semibold">
          Choose a different request
        </button>
        <BorrowRequestForm qrCode={qrCode} itemName={itemName} maximumQuantity={maximumQuantity} />
      </div>
    );
  }

  if (mode === "return") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setMode(null)} className="accent-link text-sm font-semibold">
          Choose a different request
        </button>
        <ReturnRequestForm qrCode={qrCode} itemName={itemName} />
      </div>
    );
  }

  return (
    <section className="card rounded-lg p-5 sm:p-7" aria-labelledby="equipment-request-heading">
      <p className="eyebrow">Equipment request</p>
      <h2 id="equipment-request-heading" className="mt-2 text-xl font-semibold">What would you like to do?</h2>
      <p className="muted mt-2 text-sm leading-6">Choose the request that matches this scanned item. CEIT staff will review and confirm every request.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setMode("borrow")} disabled={!borrowable} className="primary-button min-h-24 rounded-lg px-5 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50">
          <span className="block text-base font-semibold">Borrow equipment</span>
          <span className="mt-1 block text-sm font-normal opacity-90">Request this item for temporary use.</span>
        </button>
        <button type="button" onClick={() => setMode("return")} className="secondary-button min-h-24 rounded-lg px-5 py-4 text-left">
          <span className="block text-base font-semibold">Return equipment</span>
          <span className="mt-1 block text-sm font-normal opacity-90">Tell staff that you are returning a borrowed item.</span>
        </button>
      </div>
      {!borrowable ? <p className="notice mt-4 rounded-lg px-4 py-3 text-sm" role="status">This item cannot be borrowed right now, but you can still submit a return request if it was previously issued.</p> : null}
    </section>
  );
}
