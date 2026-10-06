import { canBorrowInventoryStatus } from "@/lib/borrow-availability";
import { borrowStatus } from "@/lib/borrow-status";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { formatManilaDate } from "@/lib/manila-date";
import { personName } from "@/lib/person";

import type { BorrowingRecord } from "./borrowing-query";

export function formatDateTime(value: Date) {
  return formatManilaDate(value, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Describe whether the requested equipment is available.
export function inventoryAvailabilityLabel(item: BorrowingRecord["inventoryItem"]) {
  if (item.status === "DEPLOYED") {
    return "Checked out";
  }
  if (!canBorrowInventoryStatus(item.status)) {
    return inventoryStatusLabel(item.status);
  }
  return `${item.quantity} available`;
}

// Show the borrower's name and contact details.
export function BorrowerDetails({ request }: { request: BorrowingRecord }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">{request.borrowerName}</p>
      <p className="muted">{request.studentNumber}</p>
      <p className="muted">{request.contact}</p>
    </div>
  );
}

// Show pickup, return, and reservation dates.
export function BorrowSchedule({ request }: { request: BorrowingRecord }) {
  const overdue =
    [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED].some(
      (status) => status === request.status,
    ) && request.expectedReturnDate < new Date();
  return (
    <div className="mt-2 space-y-1 text-xs leading-5">
      <p className="font-semibold">{request.isReservation ? "Reservation" : "Borrow now"}</p>
      <p className="muted">Pickup: {formatDateTime(request.startsAt)}</p>
      <p className={overdue ? "text-[var(--status-critical)] font-semibold" : "muted"}>
        Return: {formatDateTime(request.expectedReturnDate)}
        {overdue ? " · Overdue" : ""}
      </p>
      {request.approvedAt ? (
        <p className="muted">
          Approved by {personName(request.approvedByName)} · {formatDateTime(request.approvedAt)}
        </p>
      ) : null}
      {request.cancelledAt ? (
        <p className="muted">Cancelled {formatDateTime(request.cancelledAt)}</p>
      ) : null}
    </div>
  );
}
