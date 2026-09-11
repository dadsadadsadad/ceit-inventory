"use server";

import { AuditAction, ItemStatus, ItemType, Prisma } from "@prisma/client";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { checkLoanAvailability } from "@/lib/loan-availability";
import { FormError, formAction } from "@/lib/form-action";

import { borrowStatus } from "@/lib/borrow-status";
import { borrowableInventoryStatuses, canBorrowInventoryStatus, usesIndividualAssetCheckout } from "@/lib/borrow-availability";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumStaffNoteLength = 2_000;

function requestId(formData: FormData) {
  const value = String(formData.get("requestId") ?? "").trim();
  if (!uuidPattern.test(value)) throw new FormError("Invalid borrowing request.");
  return value;
}

function staffNotes(formData: FormData) {
  const value = String(formData.get("staffNotes") ?? "").trim();
  if (value.length > maximumStaffNoteLength) {
    throw new FormError(`Staff notes must be ${maximumStaffNoteLength.toLocaleString()} characters or fewer.`);
  }
  return value || null;
}

function unitLabel(quantity: number) {
  return quantity === 1 ? "unit" : "units";
}

function refreshBorrowingViews(itemId: string) {
  refreshInventoryViews(itemId);
}

async function withSerializableRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }

  throw new FormError("The borrowing request was updated by another user. Please try again.");
}

export async function markBorrowed(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await withSerializableRetry(() => prisma.$transaction(async (transaction) => {
      const request = await transaction.borrowRequest.findUnique({
        where: { id },
        include: { inventoryItem: { select: { id: true, itemType: true, name: true, quantity: true, status: true } } },
      });
      if (!request) throw new FormError("This borrowing request no longer exists.");
      if (request.status !== borrowStatus.REQUESTED && request.status !== borrowStatus.RESERVED) throw new FormError("Only pending requests or approved reservations can be checked out.");
      if (request.isReservation && request.status !== borrowStatus.RESERVED) throw new FormError("Approve the reservation before checking out the equipment.");
      const now = new Date();
      if (request.startsAt > now) throw new FormError("This reservation has not started yet. Check out the item at the agreed pickup time.");
      if (request.expectedReturnDate <= now) throw new FormError("The return time has passed. Decline or cancel this request and ask the borrower to submit new dates.");
      await checkLoanAvailability(transaction, request.inventoryItemId, now, request.expectedReturnDate, request.requestedQuantity, request.id, true);
      if (request.inventoryItem.itemType !== ItemType.ASSET) {
        throw new FormError("Only individually tracked equipment can be borrowed.");
      }
      if (!canBorrowInventoryStatus(request.inventoryItem.status)) {
        throw new FormError("This item is not available for borrowing in its current status.");
      }
      if (request.inventoryItem.quantity < request.requestedQuantity) {
        throw new FormError(`Only ${request.inventoryItem.quantity} ${unitLabel(request.inventoryItem.quantity)} of this item are currently available.`);
      }

      const outstandingQuantityLoans = await transaction.borrowRequest.count({
        where: { inventoryItemId: request.inventoryItemId, status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] }, checkedOutItemStatus: null },
      });
      // A grouped legacy asset can reach one remaining unit without becoming
      // an individually tracked asset. Keep using stock quantities until return.
      const individualAssetCheckout = outstandingQuantityLoans === 0 && usesIndividualAssetCheckout(request.inventoryItem, request.requestedQuantity);
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
      if (inventoryUpdate.count !== 1) throw new FormError("This item is no longer available in the requested quantity.");

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
          actorName: actor.username,
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    refreshBorrowingViews(itemId);
  });
}

export async function declineBorrowRequest(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await withSerializableRetry(() => prisma.$transaction(async (transaction) => {
      const request = await transaction.borrowRequest.findUnique({ where: { id }, select: { id: true, inventoryItemId: true, requestedQuantity: true, status: true } });
      if (!request) throw new FormError("This borrowing request no longer exists.");
      if (request.status !== borrowStatus.REQUESTED) throw new FormError("Only pending requests can be declined.");

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
          actorName: actor.username,
          entityId: request.id,
          entityLabel: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
          entityType: "borrow-request",
          metadata: { borrowRequestId: request.id, transition: borrowStatus.DECLINED, quantity: request.requestedQuantity },
        },
      });

      return request.inventoryItemId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    refreshBorrowingViews(itemId);
  });
}

export async function returnBorrowRequest(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);

    const itemId = await withSerializableRetry(() => prisma.$transaction(async (transaction) => {
      const request = await transaction.borrowRequest.findUnique({ where: { id }, select: { checkedOutItemStatus: true, id: true, inventoryItemId: true, requestedQuantity: true, status: true } });
      if (!request) throw new FormError("This borrowing request no longer exists.");
      if (request.status !== borrowStatus.BORROWED && request.status !== borrowStatus.RETURN_REQUESTED) throw new FormError("Only checked-out requests can be marked as returned.");

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
          actorName: actor.username,
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    refreshBorrowingViews(itemId);
  });
}

export async function approveReservation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);
    const itemId = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({ where: { id } });
      if (!request || !request.isReservation || request.status !== borrowStatus.REQUESTED) throw new FormError("Only pending reservations can be approved.");
      if (request.expectedReturnDate <= new Date()) throw new FormError("This reservation has expired. Decline it and ask the borrower to choose new dates.");
      await checkLoanAvailability(tx, request.inventoryItemId, request.startsAt, request.expectedReturnDate, request.requestedQuantity, id);
      await tx.borrowRequest.update({ where: { id }, data: { status: borrowStatus.RESERVED, approvedAt: new Date(), approvedByName: actor.username, ...(notes ? { staffNotes: notes } : {}) } });
      await tx.inventoryAudit.create({ data: {
        itemId: request.inventoryItemId, action: AuditAction.UPDATED, actorId: actor.id, actorName: actor.username,
        entityId: id, entityType: "borrow-request", entityLabel: `Reservation ${id.slice(0, 8).toUpperCase()}`,
        summary: "Reservation approved. Equipment is awaiting collection.",
        metadata: { transition: borrowStatus.RESERVED, startsAt: request.startsAt.toISOString(), expectedReturnDate: request.expectedReturnDate.toISOString() },
      } });
      return request.inventoryItemId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    refreshBorrowingViews(itemId);
  });
}

export async function cancelReservation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requestId(formData);
    const notes = staffNotes(formData);
    if (!notes) throw new FormError("Add a reason for cancelling this reservation.");
    const itemId = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      const request = await tx.borrowRequest.findUnique({ where: { id } });
      if (!request || request.status !== borrowStatus.RESERVED) throw new FormError("Only approved reservations can be cancelled. Checked-out equipment must be returned.");
      await tx.borrowRequest.update({ where: { id }, data: { status: borrowStatus.CANCELLED, cancelledAt: new Date(), staffNotes: notes } });
      await tx.inventoryAudit.create({ data: {
        itemId: request.inventoryItemId, action: AuditAction.UPDATED, actorId: actor.id, actorName: actor.username,
        entityId: id, entityType: "borrow-request", entityLabel: `Reservation ${id.slice(0, 8).toUpperCase()}`,
        summary: "Reservation cancelled; the booking time is available again.", metadata: { transition: borrowStatus.CANCELLED },
      } });
      return request.inventoryItemId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    refreshBorrowingViews(itemId);
  });
}
