"use server";

import { ItemType, Prisma, PublicRequestKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auditEventData } from "@/lib/audit-event";
import { stripControlCharacters } from "@/lib/clean-text";
import { borrowStatus } from "@/lib/borrow-status";
import { checkLoanAvailability } from "@/lib/loan-availability";
import { normalizeContactNumber } from "@/lib/contact-number";
import { borrowPolicyFromEnvironment, type BorrowPolicy } from "@/lib/borrow-policy";
import { isHoldLapsed, parseManilaDateTime, validateBorrowSchedule } from "@/lib/borrow-schedule";
import { FormError, formAction } from "@/lib/form-action";
import { assertFormToken } from "@/lib/form-token";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { borrowerDataExpiresAt } from "@/lib/borrower-data-retention";
import { enforcePublicRequestRateLimit } from "@/lib/public-request-protection";
import { prisma } from "@/prisma";

const qrCodePattern = /^[a-z0-9_-]{8,128}$/i;
const studentNumberPattern = /^[a-z0-9][a-z0-9./-]*$/i;
const maximumBorrowQuantity = 1_000;

function readText(formData: FormData, key: string, maximumLength: number) {
  const value = stripControlCharacters(String(formData.get(key) ?? "")).trim();
  if (value.length > maximumLength) {
    throw new FormError("One of the submitted fields is too long.");
  }
  return value;
}

function requiredText(
  formData: FormData,
  key: string,
  label: string,
  maximumLength: number,
  minimumLength = 1,
) {
  const value = readText(formData, key, maximumLength);
  if (value.length < minimumLength) {
    throw new FormError(`${label} is required.`);
  }
  return value;
}

function readQrCode(formData: FormData) {
  const qrCode = readText(formData, "qrCode", 128);
  if (!qrCodePattern.test(qrCode)) {
    throw new FormError("This QR code is not valid.");
  }
  return qrCode;
}

// Normalize the student number used to match requests.
function readStudentNumber(formData: FormData) {
  const studentNumber = requiredText(formData, "studentNumber", "Student number", 64, 3);
  if (!studentNumberPattern.test(studentNumber)) {
    throw new FormError("Enter a valid student number.");
  }
  return studentNumber.toUpperCase();
}

// Validate and normalize the contact number.
function readContact(formData: FormData) {
  const contact = requiredText(formData, "contact", "Contact number", 32, 7);
  if (!normalizeContactNumber(contact)) {
    throw new FormError("Enter a valid contact number with 7 to 15 digits.");
  }
  return contact;
}

// Require a positive borrowing quantity.
function readQuantity(formData: FormData) {
  const value = requiredText(formData, "requestedQuantity", "Quantity", 12);
  if (!/^\d+$/.test(value)) {
    throw new FormError("Quantity must be a whole number.");
  }
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

// Show a useful request error without database details.
function publicBorrowError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error;
  }
  if (error.code === "P2002") {
    return new FormError(
      "A matching borrowing request is already being processed. Please refresh the item page before trying again.",
    );
  }
  if (error.code === "P2003" || error.code === "P2025") {
    return new FormError(
      "This item changed while the request was being submitted. Refresh the QR code page and try again.",
    );
  }
  return new FormError(
    "The borrowing request could not be saved. Please try again or contact CEIT staff.",
  );
}

type BorrowRequestInput = {
  policy: BorrowPolicy;
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

// Check availability and save the request in one transaction.
async function createBorrowRequest(input: BorrowRequestInput) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await prisma.$transaction(
        async (transaction) => {
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
          if (!item) {
            itemUnavailable();
          }
          if (
            item.itemType !== ItemType.ASSET ||
            !item.category.isActive ||
            !item.location.isActive
          ) {
            itemUnavailable();
          }

          // Requests that nobody acted on in time no longer count against the student,
          // because a student cannot cancel them.
          const now = new Date();
          const studentRequests = await transaction.borrowRequest.findMany({
            where: {
              studentNumber: input.studentNumber,
              status: {
                in: [
                  borrowStatus.REQUESTED,
                  borrowStatus.RESERVED,
                  borrowStatus.BORROWED,
                  borrowStatus.RETURN_REQUESTED,
                ],
              },
            },
            select: {
              inventoryItemId: true,
              startsAt: true,
              expectedReturnDate: true,
              requestedQuantity: true,
              requestedAt: true,
              isReservation: true,
              status: true,
            },
          });
          const hasOverdueLoan = studentRequests.some(
            (request) =>
              (request.status === borrowStatus.BORROWED ||
                request.status === borrowStatus.RETURN_REQUESTED) &&
              request.expectedReturnDate <= now,
          );
          if (hasOverdueLoan) {
            throw new FormError(
              "You still have equipment that is past its return time. Please return it to CEIT staff before requesting more.",
            );
          }
          const openRequests = studentRequests.filter(
            (request) =>
              !isHoldLapsed(request, now, input.policy) &&
              (request.status === borrowStatus.BORROWED ||
                request.status === borrowStatus.RETURN_REQUESTED ||
                request.expectedReturnDate > now),
          );
          if (openRequests.length >= input.policy.maximumActiveRequestsPerStudent) {
            throw new FormError(
              `You already have ${input.policy.maximumActiveRequestsPerStudent} open requests or loans. Wait for CEIT staff to process them, or return equipment, before requesting more.`,
            );
          }
          const overlapsExisting = openRequests.some(
            (request) =>
              request.inventoryItemId === item.id &&
              request.startsAt < input.expectedReturnDate &&
              request.expectedReturnDate > input.startsAt,
          );
          if (overlapsExisting) {
            throw new FormError("You already have an active request for this item.");
          }

          await checkLoanAvailability(
            transaction,
            item.id,
            input.startsAt,
            input.expectedReturnDate,
            input.requestedQuantity,
          );

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
              entity: {
                id: request.id,
                itemId: item.id,
                label: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
                type: "borrow-request",
              },
              metadata: {
                startsAt: input.startsAt.toISOString(),
                isReservation: input.isReservation,
                expectedReturnDate: input.expectedReturnDate.toISOString(),
                quantity: input.requestedQuantity,
                source: "public-qr",
                transition: borrowStatus.REQUESTED,
              },
              summary: input.isReservation
                ? "Reservation requested from a QR code."
                : "Borrowing requested from a QR code.",
            }),
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return;
    } catch (error) {
      if (attempt === 0 && isSerializationFailure(error)) {
        continue;
      }
      throw publicBorrowError(error);
    }
  }
}

// Validate the public borrow form before creating a request.
export async function submitBorrowRequest(formData: FormData) {
  return formAction(async () => {
    if (readText(formData, "website", 255)) {
      throw new FormError("Unable to submit this request. Please try again.");
    }

    const qrCode = readQrCode(formData);
    assertFormToken(`borrow:${qrCode}`, readText(formData, "formToken", 200));
    const policy = borrowPolicyFromEnvironment();
    const now = new Date();
    const isReservation = formData.get("borrowWhen") === "later";
    let startsAt: Date;
    let expectedReturnDate: Date;
    try {
      startsAt = isReservation
        ? parseManilaDateTime(readText(formData, "startsAt", 16), "pickup date and time")
        : now;
      expectedReturnDate = parseManilaDateTime(
        readText(formData, "expectedReturnDate", 16),
        "return date and time",
      );
      validateBorrowSchedule(startsAt, expectedReturnDate, isReservation, now, policy);
    } catch (error) {
      throw new FormError(error instanceof Error ? error.message : "Choose valid borrowing dates.");
    }
    const input: BorrowRequestInput = {
      policy,
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

// Find the active loan and ask staff to confirm its return.
export async function submitReturnRequest(formData: FormData) {
  return formAction(async () => {
    if (readText(formData, "website", 255)) {
      throw new FormError("Unable to submit this request. Please try again.");
    }

    const qrCode = readQrCode(formData);
    assertFormToken(`return:${qrCode}`, readText(formData, "formToken", 200));
    const studentNumber = readStudentNumber(formData);
    const contact = readContact(formData);
    const returnRequestNotes = readText(formData, "returnRequestNotes", 1_000);

    // Like borrowing, only valid forms enter the public request quota.
    await enforcePublicRequestRateLimit(PublicRequestKind.RETURN);

    try {
      await prisma.$transaction(
        async (transaction) => {
          const candidates = await transaction.borrowRequest.findMany({
            where: {
              studentNumber,
              status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] },
              inventoryItem: { is: { qrCode } },
            },
            select: { id: true, inventoryItemId: true, status: true, contact: true },
          });
          const request = candidates.find(
            (candidate) =>
              normalizeContactNumber(candidate.contact) === normalizeContactNumber(contact),
          );
          if (!request) {
            throw new FormError(
              "No active borrowing record matches these details. Check the student and contact numbers, or ask CEIT staff for help.",
            );
          }
          if (request.status === borrowStatus.RETURN_REQUESTED) {
            throw new FormError(
              "A return request for this item is already waiting for staff confirmation.",
            );
          }
          await transaction.borrowRequest.update({
            where: { id: request.id },
            data: {
              status: borrowStatus.RETURN_REQUESTED,
              returnRequestedAt: new Date(),
              returnRequestNotes: returnRequestNotes || null,
            },
          });
          await transaction.inventoryAudit.create({
            data: auditEventData({
              action: "REQUESTED",
              entity: {
                id: request.id,
                itemId: request.inventoryItemId,
                label: `Borrow request ${request.id.slice(0, 8).toUpperCase()}`,
                type: "borrow-request",
              },
              metadata: {
                borrowRequestId: request.id,
                source: "public-qr",
                transition: borrowStatus.RETURN_REQUESTED,
              },
              summary: "Borrower submitted a return request from a QR code.",
            }),
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw publicBorrowError(error);
    }

    refreshInventoryViews();
    revalidatePath(`/scan/${encodeURIComponent(qrCode)}`);
    redirect(`/scan/${encodeURIComponent(qrCode)}?return=sent`);
  });
}
