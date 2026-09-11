"use client";

import { useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, Undo2, Wrench } from "lucide-react";
import { IssueReportForm } from "./issue-report-form";

import { BorrowRequestForm } from "./borrow-request-form";
import { ReturnRequestForm } from "./return-request-form";

type RequestMode = "borrow" | "return" | "issue" | null;

type BorrowReturnChooserProps = {
  borrowable: boolean;
  itemName: string;
  maximumQuantity: number;
  qrCode: string;
  canReport?: boolean;
  isAsset?: boolean;
};

export function BorrowReturnChooser({ borrowable, itemName, maximumQuantity, qrCode, canReport = true, isAsset = true }: BorrowReturnChooserProps) {
  const [mode, setMode] = useState<RequestMode>(null);

  if (mode === "issue") return <div className="space-y-4"><button type="button" onClick={() => setMode(null)} className="accent-link inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Back to item options</button><IssueReportForm qrCode={qrCode} itemName={itemName} /></div>;

  if (mode === "borrow") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setMode(null)} className="accent-link text-sm font-semibold">
          Back to item options
        </button>
        <BorrowRequestForm qrCode={qrCode} itemName={itemName} maximumQuantity={maximumQuantity} />
      </div>
    );
  }

  if (mode === "return") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setMode(null)} className="accent-link text-sm font-semibold">
          Back to item options
        </button>
        <ReturnRequestForm qrCode={qrCode} itemName={itemName} />
      </div>
    );
  }

  return (
    <section className="card rounded-lg p-5 sm:p-7" aria-labelledby="equipment-request-heading">
      <h2 id="equipment-request-heading" className="mt-2 text-xl font-semibold">What would you like to do?</h2>
      <p className="muted mt-2 text-sm leading-6">Send a request to CEIT staff using the options below.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {isAsset ? <><button type="button" onClick={() => setMode("borrow")} disabled={!borrowable} className="primary-button request-choice min-h-24 flex-col items-start justify-center rounded-lg px-5 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50">
          <CalendarDays className="mb-2" size={20} aria-hidden="true" />
          <span className="block text-base font-semibold">Borrow equipment</span>
          <span className="mt-1 block text-sm font-normal opacity-90">Borrow now or reserve for later.</span>
        </button>
        <button type="button" onClick={() => setMode("return")} className="secondary-button request-choice min-h-24 flex-col items-start justify-center rounded-lg px-5 py-4 text-left">
          <Undo2 className="mb-2" size={20} aria-hidden="true" />
          <span className="block text-base font-semibold">Return equipment</span>
          <span className="mt-1 block text-sm font-normal opacity-90">Arrange a return with staff.</span>
        </button></> : null}
        {canReport ? <button type="button" onClick={() => setMode("issue")} className="secondary-button request-choice gap-3 rounded-lg px-5 py-4 text-left sm:col-span-2"><Wrench size={20} aria-hidden="true" /><span className="flex-1"><span className="block text-sm font-semibold">Report a problem</span><span className="muted mt-1 block text-sm font-normal">Something damaged or not working?</span></span><ArrowUpRight size={18} aria-hidden="true" /></button> : null}
      </div>
      {isAsset && !borrowable ? <p className="notice mt-4 rounded-lg px-4 py-3 text-sm" role="status">This item is unavailable for new borrowing requests. You can still arrange a return.</p> : null}
    </section>
  );
}
