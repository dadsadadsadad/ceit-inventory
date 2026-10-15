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

const maxStaffNoteLength = 2_000;

function requestId(formData: FormData) {
  return requiredUuid(formData, "requestId", "Invalid borrowing request.");
}

function staffNotes(formData: FormData) {
  const value = String(formData.get("staffNotes") ?? "").trim();
  if (value.length > maxStaffNoteLength) {
    throw new FormError(
      `Staff notes must be ${maxStaffNoteLength.toLocaleString()} characters or fewer.`,
    );
  }
  return value || null;
}

function unitLabel(quantity: number) {
  return quantity === 1 ? "unit" : "units";
}

export async function markBorrowed(formData: FormData) {
  return formAction(async () => {
    const policy = borrowPolicyFromEnvironment();
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);
    // anyone can type any student number, so staff have to check the id
    if (formData.get("idChecked") !== "on") {
      throw new FormError("Check the borrower's school ID first.");
    }

    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({
        where: { id },
        include: {
          inventoryItem: {
            select: { id: true, itemType: true, name: true, quantity: true, status: true },
          },
        },
      });
      if (!request) {
        throw new FormError("This request no longer exists.");
      }
      if (request.status !== borrowStatus.REQUESTED && request.status !== borrowStatus.RESERVED) {
        throw new FormError("Only pending or approved requests can be checked out.");
      }
      if (request.isReservation && request.status !== borrowStatus.RESERVED) {
        throw new FormError("Approve the reservation first.");
      }
      const now = new Date();
      if (request.status === borrowStatus.REQUESTED && isHoldLapsed(request, now, policy)) {
        throw new FormError(
          "This request expired. Decline it and ask the borrower to send a new one.",
        );
      }
      if (request.startsAt > now) {
        throw new FormError(
          "This reservation hasn't started yet. Check it out at the pickup time.",
        );
      }
      if (request.expectedReturnDate <= now) {
        throw new FormError("The return time has passed. Decline or cancel this request.");
      }
      await checkLoanAvailability(
        tx,
        request.inventoryItemId,
        now,
        request.expectedReturnDate,
        request.requestedQuantity,
        request.id,
        true,
      );
      if (request.inventoryItem.itemType !== ItemType.ASSET) {
        throw new FormError("Only tracked equipment can be borrowed.");
      }
      if (!canBorrowInventoryStatus(request.inventoryItem.status)) {
        throw new FormError("This item can't be borrowed right now.");
      }
      if (request.inventoryItem.quantity < request.requestedQuantity) {
        throw new FormError(
          `Only ${request.inventoryItem.quantity} ${unitLabel(request.inventoryItem.quantity)} of this item are currently available.`,
        );
      }

      const outstandingQuantityLoans = await tx.borrowRequest.count({
        where: {
          inventoryItemId: request.inventoryItemId,
          status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] },
          checkedOutItemStatus: null,
        },
      });
      // old grouped assets still use quantities until they're split
      const individualAssetCheckout =
        outstandingQuantityLoans === 0 &&
        usesIndividualAssetCheckout(request.inventoryItem, request.requestedQuantity);
      const inventoryUpdate = await tx.inventoryItem.updateMany({
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
        throw new FormError("Not enough of this item is available.");
      }

      const processedAt = new Date();
      await tx.borrowRequest.update({
        where: { id: request.id },
        data: {
          status: borrowStatus.BORROWED,
          ...(notes ? { staffNotes: notes } : {}),
          processedAt,
          processedByName: actor.username,
          checkedOutItemStatus: individualAssetCheckout ? request.inventoryItem.status : null,
        },
      });
      await tx.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.BORROWED,
          summary: individualAssetCheckout
            ? "Checked out."
            : `Checked out (${request.requestedQuantity} ${unitLabel(request.requestedQuantity)}).`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: request.id,
          entityLabel: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: {
            borrowRequestId: request.id,
            transition: borrowStatus.BORROWED,
            quantity: request.requestedQuantity,
            idChecked: true,
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

// only pending requests can be declined
export async function declineBorrowRequest(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({
        where: { id },
        select: { id: true, inventoryItemId: true, requestedQuantity: true, status: true },
      });
      if (!request) {
        throw new FormError("This request no longer exists.");
      }
      if (request.status !== borrowStatus.REQUESTED) {
        throw new FormError("Only pending requests can be declined.");
      }

      await tx.borrowRequest.update({
        where: { id: request.id },
        data: {
          status: borrowStatus.DECLINED,
          ...(notes ? { staffNotes: notes } : {}),
          processedAt: new Date(),
          processedByName: actor.username,
        },
      });
      await tx.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.DECLINED,
          summary: "Request declined.",
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

export async function returnBorrowRequest(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({
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
        throw new FormError("This request no longer exists.");
      }
      if (
        request.status !== borrowStatus.BORROWED &&
        request.status !== borrowStatus.RETURN_REQUESTED
      ) {
        throw new FormError("Only checked out items can be returned.");
      }

      let restoredIndividualStatus = false;
      if (request.checkedOutItemStatus) {
        // don't overwrite a status staff changed after checkout (e.g. marked defective)
        const statusRestore = await tx.inventoryItem.updateMany({
          where: { id: request.inventoryItemId, status: ItemStatus.DEPLOYED },
          data: { status: request.checkedOutItemStatus },
        });
        restoredIndividualStatus = statusRestore.count === 1;
      } else {
        // old requests from before per-unit tracking still return by quantity
        await tx.inventoryItem.update({
          where: { id: request.inventoryItemId },
          data: { quantity: { increment: request.requestedQuantity } },
        });
      }
      await tx.borrowRequest.update({
        where: { id: request.id },
        data: {
          status: borrowStatus.RETURNED,
          ...(notes ? { staffNotes: notes } : {}),
          returnedAt: new Date(),
          returnedByName: actor.username,
        },
      });
      await tx.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.RETURNED,
          summary: request.checkedOutItemStatus
            ? restoredIndividualStatus
              ? "Returned."
              : "Returned. Status was left as is."
            : `Returned (${request.requestedQuantity} ${unitLabel(request.requestedQuantity)}).`,
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

// approve = reserve the time, checkout happens later
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
          "This reservation expired. Decline it and ask the borrower to pick new dates.",
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
          summary: "Reservation approved.",
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

// frees the reserved time, the item was never checked out
export async function cancelReservation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);
    if (!notes) {
      throw new FormError("Add a reason for cancelling.");
    }
    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({ where: { id } });
      if (!request || request.status !== borrowStatus.RESERVED) {
        throw new FormError("Only approved reservations can be cancelled.");
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
          summary: "Reservation cancelled.",
          metadata: { transition: borrowStatus.CANCELLED },
        },
      });
      return request.inventoryItemId;
    });
    refreshInventoryViews(itemId);
  });
}

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

    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({ where: { id } });
      if (!request) {
        throw new FormError("This request no longer exists.");
      }
      if (
        request.status !== borrowStatus.BORROWED &&
        request.status !== borrowStatus.RETURN_REQUESTED
      ) {
        throw new FormError("Only checked out items can get a new return time.");
      }
      // return was requested but never happened, put it back on loan
      const keepsOnLoan = request.status === borrowStatus.RETURN_REQUESTED;
      if (newReturn.getTime() === request.expectedReturnDate.getTime()) {
        throw new FormError("That's the same return time.");
      }
      const policy = borrowPolicyFromEnvironment();
      if (newReturn.getTime() - request.startsAt.getTime() > policy.maxTotalLoanDays * dayMs) {
        throw new FormError(
          `A loan can run for at most ${dayCount(policy.maxTotalLoanDays)} in total. Pick an earlier return time.`,
        );
      }
      if (newReturn > request.expectedReturnDate) {
        await checkLoanExtension(tx, request, newReturn, now);
      }

      const retentionDeadline = borrowerDataExpiresAt(newReturn);
      await tx.borrowRequest.update({
        where: { id },
        data: {
          expectedReturnDate: newReturn,
          ...(keepsOnLoan ? { status: borrowStatus.BORROWED, returnRequestedAt: null } : {}),
          // keep borrower details until retention days after the new return time
          ...(retentionDeadline > request.personalDataExpiresAt
            ? { personalDataExpiresAt: retentionDeadline }
            : {}),
          // keep the old note and append the reason
          ...(notes
            ? {
                staffNotes: [request.staffNotes, `Return time changed: ${notes}`]
                  .filter(Boolean)
                  .join("\n"),
              }
            : {}),
        },
      });
      await tx.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.UPDATED,
          summary: `${keepsOnLoan ? "Kept on loan, return" : "Return"} time changed to ${formatManilaDate(newReturn, { dateStyle: "medium", timeStyle: "short" })}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: id,
          entityLabel: `Borrow request ${id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: {
            borrowRequestId: id,
            transition: keepsOnLoan ? "RETURN_REQUEST_WITHDRAWN" : "RETURN_TIME_CHANGED",
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

export async function markReminded(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);

    const itemId = await runTransaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({
        where: { id },
        select: { id: true, inventoryItemId: true, status: true },
      });
      if (!request) {
        throw new FormError("This request no longer exists.");
      }
      if (
        request.status !== borrowStatus.BORROWED &&
        request.status !== borrowStatus.RETURN_REQUESTED
      ) {
        throw new FormError("This item isn't out right now.");
      }
      await tx.borrowRequest.update({
        where: { id: request.id },
        data: { remindedAt: new Date() },
      });
      await tx.inventoryAudit.create({
        data: {
          itemId: request.inventoryItemId,
          action: AuditAction.UPDATED,
          summary: "Borrower reminded.",
          actorId: actor.id,
          actorName: auditActorName(actor),
          entityId: request.id,
          entityLabel: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: { borrowRequestId: request.id, activityKind: "borrow-reminder" },
        },
      });
      return request.inventoryItemId;
    });

    refreshInventoryViews(itemId);
  });
}
