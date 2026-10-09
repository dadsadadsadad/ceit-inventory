import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { borrowPolicyFromEnvironment } from "@/lib/borrow-policy";
import { isHoldLapsed, manilaDateTimeInput } from "@/lib/borrow-schedule";
import { borrowStatus } from "@/lib/borrow-status";
import { reminderMessage } from "@/lib/loan-due";

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
import { ReminderControls } from "./reminder-controls";

const hoursMs = 60 * 60 * 1000;

// Staff confirm who is at the desk before equipment leaves, because anyone can type a student number.
function IdCheck({ id }: { id: string }) {
  return (
    <label className="id-check" htmlFor={id}>
      <input id={id} type="checkbox" name="idChecked" className="h-4 w-4" required />
      <span>I checked the borrower&apos;s school ID</span>
    </label>
  );
}

// Show the staff actions allowed for this request's status.
export function BorrowingActions({ request }: { request: BorrowingRecord }) {
  const now = new Date();
  const expired = request.expectedReturnDate <= now;
  const lapsed = isHoldLapsed(request, now, borrowPolicyFromEnvironment());
  if (request.status === borrowStatus.RESERVED) {
    return (
      <div className="request-actions">
        {expired ? (
          <p className="muted text-sm">Pickup period ended. Cancel this reservation to close it.</p>
        ) : request.startsAt > now ? (
          <p className="muted text-sm">Pickup: {formatDateTime(request.startsAt)}</p>
        ) : (
          <>
            {lapsed ? (
              <p className="muted text-sm">
                Pickup was missed, so this booking no longer holds the equipment. Check it out if
                the borrower arrived late, or cancel it to close it.
              </p>
            ) : null}
            <FeedbackForm
              action={markBorrowed}
              optimistic={{ entity: `borrow:${request.id}`, values: { status: "BORROWED" } }}
              successMessage="Equipment checked out."
              className="request-action-form"
            >
              <input type="hidden" name="requestId" value={request.id} />
              <IdCheck id={`id-check-${request.id}`} />
              <SubmitButton
                pendingLabel="Checking out…"
                className="primary-button rounded-lg px-3 py-2 text-sm font-semibold"
              >
                Check out equipment
              </SubmitButton>
            </FeedbackForm>
          </>
        )}
        <FeedbackForm
          action={cancelReservation}
          optimistic={{ entity: `borrow:${request.id}`, values: { status: "CANCELLED" } }}
          successMessage="Reservation cancelled."
          className="request-action-form"
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
      <div className="request-actions">
        <FeedbackForm
          action={request.isReservation ? approveReservation : markBorrowed}
          optimistic={{
            entity: `borrow:${request.id}`,
            values: { status: request.isReservation ? "RESERVED" : "BORROWED" },
          }}
          successMessage={
            request.isReservation ? "Reservation approved." : "Equipment checked out."
          }
          className="request-action-form"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`approve-note-${request.id}`}>
            Approval note
          </label>
          <input
            id={`approve-note-${request.id}`}
            name="staffNotes"
            maxLength={2_000}
            className="field min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
            placeholder="Optional staff note"
          />
          {request.isReservation ? null : <IdCheck id={`id-check-${request.id}`} />}
          <SubmitButton
            disabled={expired || lapsed}
            pendingLabel={request.isReservation ? "Approving…" : "Checking out…"}
            className="primary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {expired
              ? "Request expired"
              : lapsed
                ? "Not handled in time"
                : request.isReservation
                  ? "Approve reservation"
                  : "Check out equipment"}
          </SubmitButton>
        </FeedbackForm>
        <FeedbackForm
          action={declineBorrowRequest}
          optimistic={{ entity: `borrow:${request.id}`, values: { status: "DECLINED" } }}
          className="request-action-form"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`decline-note-${request.id}`}>
            Decline note
          </label>
          <input
            id={`decline-note-${request.id}`}
            name="staffNotes"
            maxLength={2_000}
            className="field min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
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
    const suggestedReturn = new Date(
      Math.max(request.expectedReturnDate.getTime(), now.getTime()) + 24 * hoursMs,
    );
    // Offer a reminder from a day before the return time until the equipment is back.
    const dueSoon = request.expectedReturnDate.getTime() - now.getTime() < 24 * hoursMs;
    return (
      <div className="request-actions">
        <FeedbackForm
          action={returnBorrowRequest}
          optimistic={{ entity: `borrow:${request.id}`, values: { status: "RETURNED" } }}
          className="request-action-form"
        >
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`return-note-${request.id}`}>
            Return note
          </label>
          <input
            id={`return-note-${request.id}`}
            name="staffNotes"
            maxLength={2_000}
            className="field min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
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
        {dueSoon && request.status === borrowStatus.BORROWED ? (
          <ReminderControls
            requestId={request.id}
            contact={request.contact}
            remindedLabel={
              request.remindedAt ? `reminded ${formatDateTime(request.remindedAt)}` : null
            }
            message={reminderMessage({
              borrowerName: request.borrowerName,
              dueAt: request.expectedReturnDate,
              itemName: request.inventoryItem.name,
              late: isOverdue(request, now),
            })}
          />
        ) : null}
        <details className="section-disclosure">
          <summary className="accent-link cursor-pointer text-sm font-semibold">
            {request.status === borrowStatus.RETURN_REQUESTED
              ? "Not back yet? Keep it on loan"
              : isOverdue(request, now)
                ? "Set a new return time"
                : "Change return time"}
          </summary>
          <FeedbackForm
            action={extendBorrowRequest}
            successMessage="Return time updated."
            resetOnSuccess={false}
            className="mt-3 space-y-3"
          >
            <input type="hidden" name="requestId" value={request.id} />
            <label className="block text-sm font-semibold">
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
            <label className="block text-sm font-semibold">
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
      </div>
    );
  }

  return <p className="muted text-sm">No further action is needed.</p>;
}
