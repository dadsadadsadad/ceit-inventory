"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Undo2, Wrench } from "lucide-react";
import { IssueReportForm } from "./issue-report-form";

import { BorrowRequestForm } from "./borrow-request-form";
import { ReturnRequestForm } from "./return-request-form";

export type RequestMode = "borrow" | "return" | "issue";

/** What a borrower is told about the item before they fill in anything. */
export type ItemAvailability = {
  /** When the item is next free, as a datetime-local value, if it is in use right now. */
  freeFrom: string | null;
  /** Borrowing is possible now, only for later, or not at all. */
  state: "now" | "later" | "closed";
};

type BorrowReturnChooserProps = {
  availability: ItemAvailability;
  /** Signed notes proving each form came from this page. */
  formTokens: { borrow: string; issue: string; return: string };
  initialMode?: RequestMode | null;
  policy: { maximumAdvanceDays: number; maximumLoanDays: number };
  itemName: string;
  maximumQuantity: number;
  qrCode: string;
  canReport?: boolean;
  isAsset?: boolean;
};

// Switch between borrowing, returns, and issue reports.
export function BorrowReturnChooser({
  availability,
  formTokens,
  initialMode = null,
  policy,
  itemName,
  maximumQuantity,
  qrCode,
  canReport = true,
  isAsset = true,
}: BorrowReturnChooserProps) {
  const [mode, setMode] = useState<RequestMode | null>(initialMode);
  // Keep the notes this page was opened with. A live refresh issues fresh ones, and swapping
  // them under someone who is about to press Send would make their form look "too quick".
  const [tokens] = useState(formTokens);
  const contentRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLElement>(null);
  const previousModeRef = useRef<RequestMode | null>(null);
  const borrowOpen = availability.state !== "closed";

  useEffect(() => {
    if (mode) {
      const heading = contentRef.current?.querySelector("h2");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus();
    } else {
      optionsRef.current
        ?.querySelector<HTMLButtonElement>(`[data-request-mode="${previousModeRef.current}"]`)
        ?.focus();
    }
  }, [mode]);

  if (mode) {
    return (
      <div ref={contentRef} className="space-y-4">
        <button
          type="button"
          onClick={() => setMode(null)}
          className="accent-link inline-flex items-center gap-2 text-sm font-semibold"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to item options
        </button>
        {mode === "borrow" ? (
          <BorrowRequestForm
            qrCode={qrCode}
            itemName={itemName}
            maximumQuantity={maximumQuantity}
            policy={policy}
            availability={availability}
            formToken={tokens.borrow}
          />
        ) : mode === "return" ? (
          <ReturnRequestForm qrCode={qrCode} itemName={itemName} formToken={tokens.return} />
        ) : (
          <IssueReportForm qrCode={qrCode} itemName={itemName} formToken={tokens.issue} />
        )}
      </div>
    );
  }

  return (
    <section
      ref={optionsRef}
      className="card rounded-lg p-5 sm:p-7"
      aria-labelledby="equipment-request-heading"
    >
      <h2 id="equipment-request-heading" className="text-xl font-semibold">
        Use this equipment
      </h2>
      <p className="muted mt-2 text-sm leading-6">
        {isAsset || canReport
          ? "Requests go directly to CEIT staff for confirmation."
          : "This item is no longer accepting requests. Contact CEIT staff for help."}
      </p>
      {/* Choose borrowing, returning, or reporting an issue. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {isAsset ? (
          <>
            <button
              type="button"
              data-request-mode="borrow"
              onClick={() => {
                previousModeRef.current = "borrow";
                setMode("borrow");
              }}
              disabled={!borrowOpen}
              className={`${borrowOpen ? "primary-button" : "secondary-button"} request-choice min-h-24 flex-col items-start justify-center rounded-lg px-5 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <CalendarDays className="mb-2" size={20} aria-hidden="true" />
              <span className="block text-base font-semibold">
                {availability.state === "later" ? "Reserve for later" : "Borrow equipment"}
              </span>
              <span className="mt-1 block text-sm font-normal opacity-90">
                {availability.state === "closed"
                  ? "Not available to borrow."
                  : availability.state === "later"
                    ? "In use now. Book it for after it is back."
                    : "Borrow now or reserve for later."}
              </span>
            </button>
            <button
              type="button"
              data-request-mode="return"
              onClick={() => {
                previousModeRef.current = "return";
                setMode("return");
              }}
              className="secondary-button request-choice min-h-24 flex-col items-start justify-center rounded-lg px-5 py-4 text-left"
            >
              <Undo2 className="mb-2" size={20} aria-hidden="true" />
              <span className="block text-base font-semibold">Return equipment</span>
              <span className="mt-1 block text-sm font-normal opacity-90">
                Arrange a return with staff.
              </span>
            </button>
          </>
        ) : null}
        {canReport ? (
          <button
            type="button"
            data-request-mode="issue"
            onClick={() => {
              previousModeRef.current = "issue";
              setMode("issue");
            }}
            className="secondary-button request-choice gap-3 rounded-lg px-5 py-4 text-left sm:col-span-2"
          >
            <Wrench size={20} aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-sm font-semibold">Report a problem</span>
              <span className="muted mt-1 block text-sm font-normal">
                Something damaged or not working?
              </span>
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
