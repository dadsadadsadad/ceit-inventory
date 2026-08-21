"use client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { submitBorrowRequest } from "./borrow-actions";

type BorrowRequestFormProps = {
  itemName: string;
  maximumQuantity: number;
  qrCode: string;
};

function tomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BorrowRequestForm({ itemName, maximumQuantity, qrCode }: BorrowRequestFormProps) {
  const clientMaximumQuantity = Math.min(Math.max(Math.trunc(maximumQuantity) || 1, 1), 1_000);

  return (
    <FeedbackForm action={submitBorrowRequest} className="card rounded-lg p-5 sm:p-7">
      <input type="hidden" name="qrCode" value={qrCode} />
      <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="borrow-website">Leave this field blank</label>
        <input id="borrow-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <p className="eyebrow">Borrow equipment</p>
        <h2 className="mt-2 text-xl font-semibold">Request to borrow {itemName}</h2>
        <p className="muted mt-2 text-sm leading-6">Send your request for staff review. A request is not confirmation that the item has been issued.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-semibold">Full name *</span>
          <input name="borrowerName" required autoComplete="name" maxLength={120} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Your full name" />
        </label>
        <label>
          <span className="text-sm font-semibold">Student number *</span>
          <input name="studentNumber" required autoComplete="off" maxLength={64} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. 2024-00001" />
        </label>
        <label>
          <span className="text-sm font-semibold">Contact number *</span>
          <input name="contact" required type="tel" autoComplete="tel" maxLength={32} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="09XX XXX XXXX" />
        </label>
        <label>
          <span className="text-sm font-semibold">Quantity *</span>
          <input name="requestedQuantity" required type="number" inputMode="numeric" min="1" max={clientMaximumQuantity} defaultValue="1" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" />
          <span className="muted mt-1 block text-xs">Choose how many units you need.</span>
        </label>
        <label>
          <span className="text-sm font-semibold">Expected return *</span>
          <input name="expectedReturnDate" required type="date" min={tomorrowDate()} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" />
          <span className="muted mt-1 block text-xs">Choose a date after today.</span>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-semibold">Purpose *</span>
        <textarea name="purpose" required rows={4} maxLength={1_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm leading-6" placeholder="Briefly explain how you will use the equipment." />
      </label>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="muted text-xs leading-5">Staff will use your contact number after reviewing this request.</p>
        <SubmitButton pendingLabel="Sending request…" className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold sm:w-auto">Send request</SubmitButton>
      </div>
    </FeedbackForm>
  );
}
