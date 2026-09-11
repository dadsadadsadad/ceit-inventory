"use server";

import { ItemType, Prisma, PublicRequestKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auditEventData } from "@/lib/audit-event";
import { borrowStatus } from "@/lib/borrow-status";
import { checkLoanAvailability } from "@/lib/loan-availability";
import { normalizeContactNumber } from "@/lib/contact-number";
import { parseManilaDateTime, validateBorrowSchedule } from "@/lib/borrow-schedule";
import { FormError, formAction } from "@/lib/form-action";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { borrowerDataExpiresAt } from "@/lib/borrower-data-retention";
import { enforcePublicRequestRateLimit } from "@/lib/public-request-protection";
import { prisma } from "@/prisma";

const qrCodePattern = /^[a-z0-9_-]{8,128}$/i;
const studentNumberPattern = /^[a-z0-9][a-z0-9./-]*$/i;
const maximumBorrowQuantity = 1_000;

function readText(formData: FormData, key: string, maximumLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maximumLength) throw new FormError("One of the submitted fields is too long.");
  return value;
}

function requiredText(formData: FormData, key: string, label: string, maximumLength: number, minimumLength = 1) {
  const value = readText(formData, key, maximumLength);
  if (value.length < minimumLength) throw new FormError(`${label} is required.`);
  return value;
}

function readQrCode(formData: FormData) {
  const qrCode = readText(formData, "qrCode", 128);
  if (!qrCodePattern.test(qrCode)) throw new FormError("This QR code is not valid.");
  return qrCode;
}

function readStudentNumber(formData: FormData) {
  const studentNumber = requiredText(formData, "studentNumber", "Student number", 64, 3);
  if (!studentNumberPattern.test(studentNumber)) throw new FormError("Enter a valid student number.");
  return studentNumber.toUpperCase();
}

function readContact(formData: FormData) {
  const contact = requiredText(formData, "contact", "Contact number", 32, 7);
  if (!normalizeContactNumber(contact)) throw new FormError("Enter a valid contact number with 7 to 15 digits.");
  return contact;
}

function readQuantity(formData: FormData) {
  const value = requiredText(formData, "requestedQuantity", "Quantity", 12);
  if (!/^\d+$/.test(value)) throw new FormError("Quantity must be a whole number.");
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maximumBorrowQuantity) {
    throw new FormError("Choose a quantity between 1 and 1,000.");
  }
  return quantity;
}

function itemUnavailable(): never {
  throw new FormError("This item is not currently available for a borrowing request.");
}

function isSerializationFailure(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function publicBorrowError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;
  if (error.code === "P2002") return new FormError("A matching borrowing request is already being processed. Please refresh the item page before trying again.");
  if (error.code === "P2003" || error.code === "P2025") return new FormError("This item changed while the request was being submitted. Refresh the QR code page and try again.");
  return new FormError("The borrowing request could not be saved. Please try again or contact CEIT staff.");
}

type BorrowRequestInput = {
  borrowerName: string;
  contact: string;
  expectedReturnDate: Date;
  startsAt: Date;
  isReservation: boolean;
  purpose: string;
  qrCode: string;
  requestedQuantity: number;
  studentNumber: string;
};

async function createBorrowRequest(input: BorrowRequestInput) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await prisma.$transaction(async (transaction) => {
        const item = await transaction.inventoryItem.findUnique({
          where: { qrCode: input.qrCode },
          select: {
            id: true,
            itemType: true,
            quantity: true,
            status: true,
            category: { select: { isActive: true } },
            location: { select: { isActive: true } },
          },
        });
        if (!item) itemUnavailable();
        if (item.itemType !== ItemType.ASSET || !item.category.isActive || !item.location.isActive) {
          itemUnavailable();
        }

        const activeStatuses = [borrowStatus.REQUESTED, borrowStatus.RESERVED, borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED];
        const existingRequest = await transaction.borrowRequest.findFirst({
          where: {
            inventoryItemId: item.id,
            studentNumber: input.studentNumber,
            status: { in: activeStatuses },
            startsAt: { lt: input.expectedReturnDate },
            expectedReturnDate: { gt: input.startsAt },
          },
          select: { id: true },
        });
        if (existingRequest) throw new FormError("You already have an active request for this item.");

        await checkLoanAvailability(transaction, item.id, input.startsAt, input.expectedReturnDate, input.requestedQuantity);

        const request = await transaction.borrowRequest.create({
          data: {
            inventoryItemId: item.id,
            borrowerName: input.borrowerName,
            studentNumber: input.studentNumber,
            contact: input.contact,
            purpose: input.purpose,
            requestedQuantity: input.requestedQuantity,
            expectedReturnDate: input.expectedReturnDate,
            startsAt: input.startsAt,
            isReservation: input.isReservation,
            personalDataExpiresAt: borrowerDataExpiresAt(input.expectedReturnDate),
            status: borrowStatus.REQUESTED,
          },
        });
        await transaction.inventoryAudit.create({
          data: auditEventData({
            action: "REQUESTED",
            entity: { id: request.id, itemId: item.id, label: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`, type: "borrow-request" },
            metadata: { startsAt: input.startsAt.toISOString(), isReservation: input.isReservation, expectedReturnDate: input.expectedReturnDate.toISOString(), quantity: input.requestedQuantity, source: "public-qr", transition: borrowStatus.REQUESTED },
            summary: input.isReservation ? "Reservation requested from a QR code." : "Borrowing requested from a QR code.",
          }),
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (attempt === 0 && isSerializationFailure(error)) continue;
      throw publicBorrowError(error);
    }
  }
}

export async function submitBorrowRequest(formData: FormData) {
  return formAction(async () => {
    if (readText(formData, "website", 255)) throw new FormError("Unable to submit this request. Please try again.");

    const qrCode = readQrCode(formData);
    const now = new Date();
    const isReservation = formData.get("borrowWhen") === "later";
    let startsAt: Date;
    let expectedReturnDate: Date;
    try {
      startsAt = isReservation ? parseManilaDateTime(readText(formData, "startsAt", 16), "pickup date and time") : now;
      expectedReturnDate = parseManilaDateTime(readText(formData, "expectedReturnDate", 16), "return date and time");
      validateBorrowSchedule(startsAt, expectedReturnDate, isReservation, now);
    } catch (error) { throw new FormError(error instanceof Error ? error.message : "Choose valid borrowing dates."); }
    const input: BorrowRequestInput = {
      qrCode,
      borrowerName: requiredText(formData, "borrowerName", "Full name", 120, 2),
      studentNumber: readStudentNumber(formData),
      contact: readContact(formData),
      purpose: requiredText(formData, "purpose", "Borrowing purpose", 1_000, 5),
      requestedQuantity: readQuantity(formData),
      startsAt,
      expectedReturnDate,
      isReservation,
    };

    // Validate the form first. Correcting an ordinary typo must not consume the
    // public request quota, while valid submissions remain rate limited before
    // they can write to the database.
    await enforcePublicRequestRateLimit(PublicRequestKind.BORROW);
    await createBorrowRequest(input);
    refreshInventoryViews();
    redirect(`/scan/${encodeURIComponent(qrCode)}?request=sent`);
  });
}

export async function submitReturnRequest(formData: FormData) {
  return formAction(async () => {
    if (readText(formData, "website", 255)) throw new FormError("Unable to submit this request. Please try again.");

    const qrCode = readQrCode(formData);
    const studentNumber = readStudentNumber(formData);
    const contact = readContact(formData);
    const returnRequestNotes = readText(formData, "returnRequestNotes", 1_000);

    // Like borrowing, only valid forms enter the public request quota.
    await enforcePublicRequestRateLimit(PublicRequestKind.RETURN);

    try {
      await prisma.$transaction(async (transaction) => {
        const candidates = await transaction.borrowRequest.findMany({
          where: {
            studentNumber,
            status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] },
            inventoryItem: { is: { qrCode } },
          },
          select: { id: true, inventoryItemId: true, status: true, contact: true },
        });
        const request = candidates.find((candidate) => normalizeContactNumber(candidate.contact) === normalizeContactNumber(contact));
        if (!request) {
          throw new FormError("No active borrowing record matches these details. Check the student and contact numbers, or ask CEIT staff for help.");
        }
        if (request.status === borrowStatus.RETURN_REQUESTED) {
          throw new FormError("A return request for this item is already waiting for staff confirmation.");
        }
        await transaction.borrowRequest.update({
          where: { id: request.id },
          data: { status: borrowStatus.RETURN_REQUESTED, returnRequestedAt: new Date(), returnRequestNotes: returnRequestNotes || null },
        });
        await transaction.inventoryAudit.create({
          data: auditEventData({
            action: "REQUESTED",
            entity: { id: request.id, itemId: request.inventoryItemId, label: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`, type: "borrow-request" },
            metadata: { borrowRequestId: request.id, source: "public-qr", transition: borrowStatus.RETURN_REQUESTED },
            summary: "Borrower submitted a return request from a QR code.",
          }),
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      throw publicBorrowError(error);
    }

    refreshInventoryViews();
    revalidatePath(`/scan/${encodeURIComponent(qrCode)}`);
    redirect(`/scan/${encodeURIComponent(qrCode)}?return=sent`);
  });
}
