"use client";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { submitIssueReport } from "./issue-actions";

// Send an equipment problem to maintenance.
export function IssueReportForm({
  formToken,
  itemName,
  qrCode,
}: {
  formToken: string;
  itemName: string;
  qrCode: string;
}) {
  return (
    <FeedbackForm
      action={submitIssueReport}
      createPreview={{ titleField: "title", detailFields: ["description"] }}
      className="card request-form space-y-4 rounded-lg p-5 sm:p-7"
    >
      <input type="hidden" name="qrCode" value={qrCode} />
      <input type="hidden" name="formToken" value={formToken} />
      <div className="honeypot" aria-hidden="true">
        {/* Hidden field used to catch automated submissions. */}
        <label htmlFor="issue-website">Leave this field blank</label>
        <input id="issue-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Report a problem</h2>
        <p className="muted mt-2 text-sm leading-6">
          Tell CEIT staff what happened to {itemName}. They will check the equipment and arrange any
          repairs.
        </p>
      </div>
      {/* Who is reporting, the issue title, and what happened. */}
      <label className="block">
        <span className="text-sm font-semibold">Your name *</span>
        <input
          name="reporterName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          placeholder="So staff know who to ask about it"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Issue title *</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          placeholder="e.g. Monitor won’t turn on"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">What happened? *</span>
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={2_000}
          rows={4}
          className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          placeholder="Describe the problem and when you noticed it."
        />
      </label>
      <p className="muted text-xs leading-5">
        Staff will see your name with the report. Please leave out passwords and student numbers.
      </p>
      <SubmitButton
        pendingLabel="Sending…"
        className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
      >
        Send issue report
      </SubmitButton>
    </FeedbackForm>
  );
}
