"use server";

import { AuditAction, ItemStatus, ItemType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { borrowStatus } from "@/lib/borrow-status";
import { requireWriteAccess } from "@/lib/supabase/server";
import { prisma } from "@/prisma";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const borrowableStatuses = [ItemStatus.OK, ItemStatus.WORKING] as const;
const maximumStaffNoteLength = 2_000;

function requestId(formData: FormData) {
  const value = String(formData.get("requestId") ?? "").trim();
  if (!uuidPattern.test(value)) throw new Error("Invalid borrowing request.");
  return value;
}

function staffNotes(formData: FormData) {
  const value = String(formData.get("staffNotes") ?? "").trim();
  if (value.length > maximumStaffNoteLength) {
    throw new Error(`Staff notes must be ${maximumStaffNoteLength.toLocaleString()} characters or fewer.`);
  }
  return value || null;
}

function unitLabel(quantity: number) {
  return quantity === 1 ? "unit" : "units";
}

function refreshBorrowingViews(itemId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/borrowing");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/dashboard/inventory/${itemId}`);
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

  throw new Error("The borrowing request was updated by another user. Please try again.");
}

export async function markBorrowed(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requestId(formData);
  const notes = staffNotes(formData);

  const itemId = await withSerializableRetry(() => prisma.$transaction(async (transaction) => {
    const request = await transaction.borrowRequest.findUnique({
      where: { id },
      include: { inventoryItem: { select: { id: true, itemType: true, name: true, quantity: true, status: true } } },
    });
    if (!request) throw new Error("This borrowing request no longer exists.");
    if (request.status !== borrowStatus.REQUESTED) throw new Error("Only pending requests can be marked as borrowed.");
    if (request.inventoryItem.itemType !== ItemType.ASSET) {
      throw new Error("Only individually tracked equipment can be borrowed.");
    }
    if (!borrowableStatuses.includes(request.inventoryItem.status as (typeof borrowableStatuses)[number])) {
      throw new Error("This item is not available for borrowing in its current status.");
    }
    if (request.inventoryItem.quantity < request.requestedQuantity) {
      throw new Error(`Only ${request.inventoryItem.quantity} ${unitLabel(request.inventoryItem.quantity)} of this item are currently available.`);
    }

    const inventoryUpdate = await transaction.inventoryItem.updateMany({
      where: {
        id: request.inventoryItemId,
        quantity: { gte: request.requestedQuantity },
        status: { in: [...borrowableStatuses] },
      },
      data: { quantity: { decrement: request.requestedQuantity } },
    });
    if (inventoryUpdate.count !== 1) throw new Error("This item is no longer available in the requested quantity.");

    const processedAt = new Date();
    await transaction.borrowRequest.update({
      where: { id: request.id },
      data: {
        status: borrowStatus.BORROWED,
        ...(notes ? { staffNotes: notes } : {}),
        processedAt,
        processedByName: actor.email,
      },
    });
    await transaction.inventoryAudit.create({
      data: {
        itemId: request.inventoryItemId,
        action: AuditAction.UPDATED,
        summary: `Borrow request approved: ${request.requestedQuantity} ${unitLabel(request.requestedQuantity)} checked out.`,
        actorId: actor.id,
        actorName: actor.email,
        metadata: { borrowRequestId: request.id, transition: borrowStatus.BORROWED, quantity: request.requestedQuantity },
      },
    });

    return request.inventoryItemId;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  refreshBorrowingViews(itemId);
}

export async function declineBorrowRequest(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requestId(formData);
  const notes = staffNotes(formData);

  const itemId = await withSerializableRetry(() => prisma.$transaction(async (transaction) => {
    const request = await transaction.borrowRequest.findUnique({ where: { id }, select: { id: true, inventoryItemId: true, requestedQuantity: true, status: true } });
    if (!request) throw new Error("This borrowing request no longer exists.");
    if (request.status !== borrowStatus.REQUESTED) throw new Error("Only pending requests can be declined.");

    await transaction.borrowRequest.update({
      where: { id: request.id },
      data: {
        status: borrowStatus.DECLINED,
        ...(notes ? { staffNotes: notes } : {}),
        processedAt: new Date(),
        processedByName: actor.email,
      },
    });
    await transaction.inventoryAudit.create({
      data: {
        itemId: request.inventoryItemId,
        action: AuditAction.UPDATED,
        summary: `Borrow request declined for ${request.requestedQuantity} ${unitLabel(request.requestedQuantity)}.`,
        actorId: actor.id,
        actorName: actor.email,
        metadata: { borrowRequestId: request.id, transition: borrowStatus.DECLINED, quantity: request.requestedQuantity },
      },
    });

    return request.inventoryItemId;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  refreshBorrowingViews(itemId);
}

export async function returnBorrowRequest(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requestId(formData);
  const notes = staffNotes(formData);

  const itemId = await withSerializableRetry(() => prisma.$transaction(async (transaction) => {
    const request = await transaction.borrowRequest.findUnique({ where: { id }, select: { id: true, inventoryItemId: true, requestedQuantity: true, status: true } });
    if (!request) throw new Error("This borrowing request no longer exists.");
    if (request.status !== borrowStatus.BORROWED) throw new Error("Only checked-out requests can be marked as returned.");

    await transaction.inventoryItem.update({
      where: { id: request.inventoryItemId },
      data: { quantity: { increment: request.requestedQuantity } },
    });
    await transaction.borrowRequest.update({
      where: { id: request.id },
      data: {
        status: borrowStatus.RETURNED,
        ...(notes ? { staffNotes: notes } : {}),
        returnedAt: new Date(),
        returnedByName: actor.email,
      },
    });
    await transaction.inventoryAudit.create({
      data: {
        itemId: request.inventoryItemId,
        action: AuditAction.UPDATED,
        summary: `Borrowed item returned: ${request.requestedQuantity} ${unitLabel(request.requestedQuantity)} restored.`,
        actorId: actor.id,
        actorName: actor.email,
        metadata: { borrowRequestId: request.id, transition: borrowStatus.RETURNED, quantity: request.requestedQuantity },
      },
    });

    return request.inventoryItemId;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  refreshBorrowingViews(itemId);
}
