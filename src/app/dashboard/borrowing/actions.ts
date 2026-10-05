"use server";

import { AuditAction, ItemStatus, ItemType } from "@prisma/client";
import { auditActorName } from "@/lib/audit-event";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { checkLoanAvailability, checkLoanExtension } from "@/lib/loan-availability";
import { borrowerDataExpiresAt } from "@/lib/borrower-data-retention";
import { borrowPolicyFromEnvironment, dayCount, dayMs } from "@/lib/borrow-policy";
import { isHoldLapsed, parseManilaDateTime } from "@/lib/borrow-schedule";
import { formatManilaDate } from "@/lib/manila-date";
import { runTransaction } from "@/lib/database-transaction";

import { FormError, formAction } from "@/lib/form-action";
import { requiredUuid } from "@/lib/form-fields";

import { borrowStatus } from "@/lib/borrow-status";
import {
  borrowableInventoryStatuses,
  canBorrowInventoryStatus,
  usesIndividualAssetCheckout,
} from "@/lib/borrow-availability";
import { requireWriteAccess } from "@/lib/inventory-auth";

const maximumStaffNoteLength = 2_000;

// Validate the borrowing request ID from the form.
function requestId(formData: FormData) {
  return requiredUuid(formData, "requestId", "Invalid borrowing request.");
}

// Read the staff note and check its length.
function staffNotes(formData: FormData) {
  const value = String(formData.get("staffNotes") ?? "").trim();
  if (value.length > maximumStaffNoteLength) {
    throw new FormError(
      `Staff notes must be ${maximumStaffNoteLength.toLocaleString()} characters or fewer.`,
    );
  }
  return value || null;
}

function unitLabel(quantity: number) {
  return quantity === 1 ? "unit" : "units";
}

// Check equipment out to a borrower.
export async function markBorrowed(formData: FormData) {
  return formAction(async () => {
    const policy = borrowPolicyFromEnvironment();
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await runTransaction(async (transaction) => {
      const request = await transaction.borrowRequest.findUnique({
        where: { id },
        include: {
          inventoryItem: {
            select: { id: true, itemType: true, name: true, quantity: true, status: true },
          },
        },
      });
      if (!request) {
        throw new FormError("This borrowing request no longer exists.");
      }
      if (request.status !== borrowStatus.REQUESTED && request.status !== borrowStatus.RESERVED) {
        throw new FormError("Only pending requests or approved reservations can be checked out.");
      }
      if (request.isReservation && request.status !== borrowStatus.RESERVED) {
        throw new FormError("Approve the reservation before checking out the equipment.");
      }
      const now = new Date();
      if (request.status === borrowStatus.REQUESTED && isHoldLapsed(request, now, policy)) {
        throw new FormError(
          "This request was not handled in time and no longer holds the equipment. Decline it and ask the borrower to submit a new request.",
        );
      }
      if (request.startsAt > now) {
        throw new FormError(
          "This reservation has not started yet. Check out the item at the agreed pickup time.",
        );
      }
      if (request.expectedReturnDate <= now) {
        throw new FormError(
          "The return time has passed. Decline or cancel this request and ask the borrower to submit new dates.",
        );
      }
      await checkLoanAvailability(
        transaction,
        request.inventoryItemId,
        now,
        request.expectedReturnDate,
        request.requestedQuantity,
        request.id,
        true,
      );
      if (request.inventoryItem.itemType !== ItemType.ASSET) {
        throw new FormError("Only individually tracked equipment can be borrowed.");
      }
      if (!canBorrowInventoryStatus(request.inventoryItem.status)) {
        throw new FormError("This item is not available for borrowing in its current status.");
      }
      if (request.inventoryItem.quantity < request.requestedQuantity) {
        throw new FormError(
          `Only ${request.inventoryItem.quantity} ${unitLabel(request.inventoryItem.quantity)} of this item are currently available.`,
        );
      }

      const outstandingQuantityLoans = await transaction.borrowRequest.count({
        where: {
          inventoryItemId: request.inventoryItemId,
          status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] },
          checkedOutItemStatus: null,
        },
      });
      // A grouped legacy asset can reach one remaining unit without becoming
      // an individually tracked asset. Keep using stock quantities until return.
      const individualAssetCheckout =
        outstandingQuantityLoans === 0 &&
        usesIndividualAssetCheckout(request.inventoryItem, request.requestedQuantity);
      const inventoryUpdate = await transaction.inventoryItem.updateMany({
        where: {
          id: request.inventoryItemId,
          quantity: { gte: request.requestedQuantity },
          status: { in: [...borrowableInventoryStatuses] },
        },
        data: individualAssetCheckout
          ? { status: ItemStatus.DEPLOYED }
          : { quantity: { decrement: request.requestedQuantity } },
      });
      if (inventoryUpdate.count !== 1) {
        throw new FormError("This item is no longer available in the requested quantity.");
      }

      const processedAt = new Date();
      await transaction.borrowRequest.update({
        where: { id: request.id },
        data: {
          status: borrowStatus.BORROWED,
          ...(notes ? { staffNotes: notes } : {}),
          processedAt,
          processedByName: actor.username,
          checkedOutItemStatus: individualAssetCheckout ? request.inventoryItem.status : null,
        },
      });
      await transaction.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.BORROWED,
          summary: individualAssetCheckout
            ? "Borrow request approved: individual tagged asset checked out."
            : `Borrow request approved: ${request.requestedQuantity} ${unitLabel(request.requestedQuantity)} checked out.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: request.id,
          entityLabel: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: {
            borrowRequestId: request.id,
            transition: borrowStatus.BORROWED,
            quantity: request.requestedQuantity,
            checkoutMode: individualAssetCheckout ? "asset-status" : "quantity",
            previousItemStatus: individualAssetCheckout ? request.inventoryItem.status : null,
          },
        },
      });

      return request.inventoryItemId;
    });

    refreshInventoryViews(itemId);
  });
}

// Close a pending request without checking out equipment.
export async function declineBorrowRequest(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await runTransaction(async (transaction) => {
      const request = await transaction.borrowRequest.findUnique({
        where: { id },
        select: { id: true, inventoryItemId: true, requestedQuantity: true, status: true },
      });
      if (!request) {
        throw new FormError("This borrowing request no longer exists.");
      }
      if (request.status !== borrowStatus.REQUESTED) {
        throw new FormError("Only pending requests can be declined.");
      }

      await transaction.borrowRequest.update({
        where: { id: request.id },
        data: {
          status: borrowStatus.DECLINED,
          ...(notes ? { staffNotes: notes } : {}),
          processedAt: new Date(),
          processedByName: actor.username,
        },
      });
      await transaction.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.DECLINED,
          summary: `Borrow request declined for ${request.requestedQuantity} ${unitLabel(request.requestedQuantity)}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: request.id,
          entityLabel: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: {
            borrowRequestId: request.id,
            transition: borrowStatus.DECLINED,
            quantity: request.requestedQuantity,
          },
        },
      });

      return request.inventoryItemId;
    });

    refreshInventoryViews(itemId);
  });
}

// Confirm the return and restore availability.
export async function returnBorrowRequest(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await runTransaction(async (transaction) => {
      const request = await transaction.borrowRequest.findUnique({
        where: { id },
        select: {
          checkedOutItemStatus: true,
          id: true,
          inventoryItemId: true,
          requestedQuantity: true,
          status: true,
        },
      });
      if (!request) {
        throw new FormError("This borrowing request no longer exists.");
      }
      if (
        request.status !== borrowStatus.BORROWED &&
        request.status !== borrowStatus.RETURN_REQUESTED
      ) {
        throw new FormError("Only checked-out requests can be marked as returned.");
      }

      let restoredIndividualStatus = false;
      if (request.checkedOutItemStatus) {
        // Do not overwrite a staff member's later defect/retirement decision.
        // In that case the return is still recorded, but the current status is
        // intentionally retained for follow-up.
        const statusRestore = await transaction.inventoryItem.updateMany({
          where: { id: request.inventoryItemId, status: ItemStatus.DEPLOYED },
          data: { status: request.checkedOutItemStatus },
        });
        restoredIndividualStatus = statusRestore.count === 1;
      } else {
        // Requests created before one-record-per-asset tracking used stock
        // quantities. Preserve that historical return behavior.
        await transaction.inventoryItem.update({
          where: { id: request.inventoryItemId },
          data: { quantity: { increment: request.requestedQuantity } },
        });
      }
      await transaction.borrowRequest.update({
        where: { id: request.id },
        data: {
          status: borrowStatus.RETURNED,
          ...(notes ? { staffNotes: notes } : {}),
          returnedAt: new Date(),
          returnedByName: actor.username,
        },
      });
      await transaction.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.RETURNED,
          summary: request.checkedOutItemStatus
            ? restoredIndividualStatus
              ? "Borrowed individual tagged asset returned and made available."
              : "Borrowed individual tagged asset returned; its staff-updated status was preserved."
            : `Borrowed item returned: ${request.requestedQuantity} ${unitLabel(request.requestedQuantity)} restored.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: request.id,
          entityLabel: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: {
            borrowRequestId: request.id,
            transition: borrowStatus.RETURNED,
            quantity: request.requestedQuantity,
            checkoutMode: request.checkedOutItemStatus ? "asset-status" : "quantity",
            restoredItemStatus: restoredIndividualStatus ? request.checkedOutItemStatus : null,
          },
        },
      });

      return request.inventoryItemId;
    });

    refreshInventoryViews(itemId);
  });
}

// Reserve the time without checking out the item.
export async function approveReservation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);
    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({ where: { id } });
      if (!request || !request.isReservation || request.status !== borrowStatus.REQUESTED) {
        throw new FormError("Only pending reservations can be approved.");
      }
      if (
        request.expectedReturnDate <= new Date() ||
        isHoldLapsed(request, new Date(), borrowPolicyFromEnvironment())
      ) {
        throw new FormError(
          "This reservation has expired or its pickup time has passed. Decline it and ask the borrower to choose new dates.",
        );
      }
      await checkLoanAvailability(
        tx,
        request.inventoryItemId,
        request.startsAt,
        request.expectedReturnDate,
        request.requestedQuantity,
        id,
      );
      await tx.borrowRequest.update({
        where: { id },
        data: {
          status: borrowStatus.RESERVED,
          approvedAt: new Date(),
          approvedByName: actor.username,
          ...(notes ? { staffNotes: notes } : {}),
        },
      });
      await tx.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.UPDATED,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: id,
          entityType: "borrow-request",
          entityLabel: `Reservation ${id.slice(0, 8).toUpperCase()}`,
          summary: "Reservation approved. Equipment is awaiting collection.",
          metadata: {
            transition: borrowStatus.RESERVED,
            startsAt: request.startsAt.toISOString(),
            expectedReturnDate: request.expectedReturnDate.toISOString(),
          },
        },
      });
      return request.inventoryItemId;
    });
    refreshInventoryViews(itemId);
  });
}

// Release an approved reservation.
export async function cancelReservation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);
    if (!notes) {
      throw new FormError("Add a reason for cancelling this reservation.");
    }
    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({ where: { id } });
      if (!request || request.status !== borrowStatus.RESERVED) {
        throw new FormError(
          "Only approved reservations can be cancelled. Checked-out equipment must be returned.",
        );
      }
      await tx.borrowRequest.update({
        where: { id },
        data: { status: borrowStatus.CANCELLED, cancelledAt: new Date(), staffNotes: notes },
      });
      await tx.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.UPDATED,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: id,
          entityType: "borrow-request",
          entityLabel: `Reservation ${id.slice(0, 8).toUpperCase()}`,
          summary: "Reservation cancelled; the booking time is available again.",
          metadata: { transition: borrowStatus.CANCELLED },
        },
      });
      return request.inventoryItemId;
    });
    refreshInventoryViews(itemId);
  });
}

// Move the agreed return time of equipment that is still checked out.
export async function extendBorrowRequest(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);
    let newReturn: Date;
    try {
      newReturn = parseManilaDateTime(
        String(formData.get("expectedReturnDate") ?? "").trim(),
        "return date and time",
      );
    } catch (error) {
      throw new FormError(error instanceof Error ? error.message : "Choose a valid return time.");
    }
    const now = new Date();
    if (newReturn <= now) {
      throw new FormError("Choose a return time in the future.");
    }
    if (newReturn.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
      throw new FormError("Choose a return time within the next year.");
    }

    const itemId = await runTransaction(async (transaction) => {
      const request = await transaction.borrowRequest.findUnique({ where: { id } });
      if (!request) {
        throw new FormError("This borrowing request no longer exists.");
      }
      if (request.status !== borrowStatus.BORROWED) {
        throw new FormError(
          "Only equipment that is currently checked out can have its return time changed.",
        );
      }
      if (newReturn.getTime() === request.expectedReturnDate.getTime()) {
        throw new FormError("Choose a different return time to save a change.");
      }
      const policy = borrowPolicyFromEnvironment();
      if (newReturn.getTime() - request.startsAt.getTime() > policy.maximumTotalLoanDays * dayMs) {
        throw new FormError(
          `A loan can run for at most ${dayCount(policy.maximumTotalLoanDays)} in total. Choose an earlier return time, or have the borrower return the equipment and request it again.`,
        );
      }
      if (newReturn > request.expectedReturnDate) {
        await checkLoanExtension(transaction, request, newReturn, now);
      }

      const retentionDeadline = borrowerDataExpiresAt(newReturn);
      await transaction.borrowRequest.update({
        where: { id },
        data: {
          expectedReturnDate: newReturn,
          // Borrower details are kept until the retention period after the agreed return.
          ...(retentionDeadline > request.personalDataExpiresAt
            ? { personalDataExpiresAt: retentionDeadline }
            : {}),
          // Keep the earlier note (such as the approval note) and add the reason beside it.
          ...(notes
            ? {
                staffNotes: [request.staffNotes, `Return time changed: ${notes}`]
                  .filter(Boolean)
                  .join("\n"),
              }
            : {}),
        },
      });
      await transaction.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.UPDATED,
          summary: `Return time changed to ${formatManilaDate(newReturn, { dateStyle: "medium", timeStyle: "short" })}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: id,
          entityLabel: `Borrow request ${id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: {
            borrowRequestId: id,
            transition: "RETURN_TIME_CHANGED",
            previousReturn: request.expectedReturnDate.toISOString(),
            newReturn: newReturn.toISOString(),
          },
        },
      });
      return request.inventoryItemId;
    });

    refreshInventoryViews(itemId);
  });
}
