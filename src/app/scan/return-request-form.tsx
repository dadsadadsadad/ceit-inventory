"use client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { submitReturnRequest } from "./borrow-actions";

export function ReturnRequestForm({ itemName, qrCode }: { itemName: string; qrCode: string }) {
  return (
    <FeedbackForm action={submitReturnRequest} className="card rounded-lg p-5 sm:p-7">
      <input type="hidden" name="qrCode" value={qrCode} />
      <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true"><label htmlFor="return-website">Leave this field blank</label><input id="return-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
      <p className="eyebrow">Return equipment</p>
      <h2 className="mt-2 text-xl font-semibold">Request return for {itemName}</h2>
      <p className="muted mt-2 text-sm leading-6">Enter the same student number and contact number used for borrowing. Staff will inspect the item and confirm the return.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-semibold">Student number *</span><input required name="studentNumber" autoComplete="off" maxLength={64} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. 2024-00001" /></label><label><span className="text-sm font-semibold">Contact number *</span><input required name="contact" type="tel" autoComplete="tel" maxLength={32} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="09XX XXX XXXX" /></label></div>
      <label className="mt-4 block"><span className="text-sm font-semibold">Return notes</span><textarea name="returnRequestNotes" rows={3} maxLength={1_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Mention damage, missing accessories, or anything staff should know." /></label>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="muted text-xs leading-5">A return is only completed after a CEIT staff member confirms it.</p><SubmitButton pendingLabel="Sending return request…" className="secondary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold sm:w-auto">Request return</SubmitButton></div>
    </FeedbackForm>
  );
}
