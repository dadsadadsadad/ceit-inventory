import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { manilaDateTimeInput } from "@/lib/borrow-schedule";
import { borrowStatus } from "@/lib/borrow-status";

import {
  approveReservation,
  cancelReservation,
  declineBorrowRequest,
  extendBorrowRequest,
  markBorrowed,
  returnBorrowRequest,
} from "./actions";
import { formatDateTime } from "./borrowing-details";
import { isOverdue, type BorrowingRecord } from "./borrowing-query";

// Show the staff actions allowed for this request's status.
export function BorrowingActions({
  request,
  layout,
}: {
  request: BorrowingRecord;
  layout: "mobile" | "desktop";
}) {
  const expired = request.expectedReturnDate <= new Date();
  if (request.status === borrowStatus.RESERVED) {
    return (
      <div className="space-y-3">
        {expired ? (
          <p className="muted text-xs">Pickup period ended. Cancel this reservation to close it.</p>
        ) : request.startsAt > new Date() ? (
          <p className="muted text-xs">Pickup: {formatDateTime(request.startsAt)}</p>
        ) : (
          <FeedbackForm
            action={markBorrowed}
            optimistic={{ entity: `borrow:${request.id}`, values: { status: "BORROWED" } }}
            successMessage="Equipment checked out."
          >
            <input type="hidden" name="requestId" value={request.id} />
            <SubmitButton
              pendingLabel="Checking out…"
              className="primary-button rounded-lg px-3 py-2 text-sm font-semibold"
            >
              Check out equipment
            </SubmitButton>
          </FeedbackForm>
        )}
        <FeedbackForm
          action={cancelReservation}
          optimistic={{ entity: `borrow:${request.id}`, values: { status: "CANCELLED" } }}
          successMessage="Reservation cancelled."
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <input
            required
            name="staffNotes"
            maxLength={2_000}
            aria-label="Cancellation reason"
            placeholder="Reason for cancellation"
            className="field min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
          />
          <SubmitButton
            pendingLabel="Cancelling…"
            className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            Cancel reservation
          </SubmitButton>
        </FeedbackForm>
      </div>
    );
  }
  if (request.status === borrowStatus.REQUESTED) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <FeedbackForm
          action={request.isReservation ? approveReservation : markBorrowed}
          optimistic={{
            entity: `borrow:${request.id}`,
            values: { status: request.isReservation ? "RESERVED" : "BORROWED" },
          }}
          successMessage={
            request.isReservation ? "Reservation approved." : "Equipment checked out."
          }
          className="flex flex-1 flex-wrap gap-2"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`approve-note-${layout}-${request.id}`}>
            Approval note
          </label>
          <input
            id={`approve-note-${layout}-${request.id}`}
            name="staffNotes"
            maxLength={2_000}
            className="field min-w-40 flex-1 rounded-lg px-3 py-2 text-sm"
            placeholder="Optional staff note"
          />
          <SubmitButton
            disabled={expired}
            pendingLabel={request.isReservation ? "Approving…" : "Checking out…"}
            className="primary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {expired
              ? "Request expired"
              : request.isReservation
                ? "Approve reservation"
                : "Check out equipment"}
          </SubmitButton>
        </FeedbackForm>
        <FeedbackForm
          action={declineBorrowRequest}
          optimistic={{ entity: `borrow:${request.id}`, values: { status: "DECLINED" } }}
          className="flex flex-1 flex-wrap gap-2"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`decline-note-${layout}-${request.id}`}>
            Decline note
          </label>
          <input
            id={`decline-note-${layout}-${request.id}`}
            name="staffNotes"
            maxLength={2_000}
            className="field min-w-40 flex-1 rounded-lg px-3 py-2 text-sm"
            placeholder="Reason or staff note"
          />
          <SubmitButton
            pendingLabel="Declining…"
            className="danger-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            Decline
          </SubmitButton>
        </FeedbackForm>
      </div>
    );
  }

  if (
    request.status === borrowStatus.BORROWED ||
    request.status === borrowStatus.RETURN_REQUESTED
  ) {
    const now = new Date();
    const suggestedReturn = new Date(
      Math.max(request.expectedReturnDate.getTime(), now.getTime()) + 24 * 60 * 60 * 1000,
    );
    return (
      <div className="space-y-3">
        <FeedbackForm
          action={returnBorrowRequest}
          optimistic={{ entity: `borrow:${request.id}`, values: { status: "RETURNED" } }}
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`return-note-${layout}-${request.id}`}>
            Return note
          </label>
          <input
            id={`return-note-${layout}-${request.id}`}
            name="staffNotes"
            maxLength={2_000}
            className="field min-w-48 flex-1 rounded-lg px-3 py-2 text-sm"
            placeholder="Optional return note"
          />
          <SubmitButton
            pendingLabel="Recording…"
            className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {request.status === borrowStatus.RETURN_REQUESTED
              ? "Confirm returned"
              : "Mark returned"}
          </SubmitButton>
        </FeedbackForm>
        {request.status === borrowStatus.BORROWED ? (
          <details className="section-disclosure">
            <summary className="accent-link cursor-pointer text-xs font-semibold">
              {isOverdue(request, now) ? "Set a new return time" : "Change return time"}
            </summary>
            <FeedbackForm
              action={extendBorrowRequest}
              successMessage="Return time updated."
              resetOnSuccess={false}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="requestId" value={request.id} />
              <label className="block text-xs font-semibold">
                <span className="block">New return date and time</span>
                <input
                  required
                  type="datetime-local"
                  name="expectedReturnDate"
                  min={manilaDateTimeInput(now)}
                  defaultValue={manilaDateTimeInput(suggestedReturn)}
                  className="field mt-1 w-full rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold">
                <span className="block">Reason (optional)</span>
                <input
                  name="staffNotes"
                  maxLength={2_000}
                  className="field mt-1 w-full rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Approved by the instructor"
                />
              </label>
              <SubmitButton
                pendingLabel="Saving…"
                className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
              >
                Save return time
              </SubmitButton>
            </FeedbackForm>
          </details>
        ) : null}
      </div>
    );
  }

  return <p className="muted text-sm">No further action is needed.</p>;
}
