"use client";

import { Check, Copy, MessageSquare } from "lucide-react";
import { useState } from "react";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { markReminded } from "./actions";

// A ready-made reminder staff can copy or text, and a way to note that it was sent.
export function ReminderControls({
  contact,
  message,
  remindedLabel,
  requestId,
}: {
  contact: string;
  message: string;
  remindedLabel: string | null;
  requestId: string;
}) {
  const [copied, setCopied] = useState(false);
  const phone = contact.replace(/[^\d+]/g, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be blocked; the message is shown below so it can be selected.
    }
  }

  return (
    <details className="section-disclosure reminder-controls">
      <summary className="accent-link cursor-pointer text-sm font-semibold">
        Remind the borrower
        {remindedLabel ? <span className="muted font-normal"> · {remindedLabel}</span> : null}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="reminder-message">{message}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy message"}
          </button>
          {phone ? (
            <a
              href={`sms:${phone}?&body=${encodeURIComponent(message)}`}
              className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
            >
              <MessageSquare size={16} aria-hidden="true" />
              Text them
            </a>
          ) : null}
        </div>
        <FeedbackForm action={markReminded} successMessage="Reminder noted." resetOnSuccess={false}>
          <input type="hidden" name="requestId" value={requestId} />
          <SubmitButton
            pendingLabel="Saving…"
            className="primary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            I reminded them
          </SubmitButton>
        </FeedbackForm>
      </div>
    </details>
  );
}
