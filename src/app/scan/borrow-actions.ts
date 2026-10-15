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
const maxBorrowQuantity = 1_000;

function readText(formData: FormData, key: string, maxLength: number) {
  const value = stripControlCharacters(String(formData.get(key) ?? "")).trim();
  if (value.length > maxLength) {
    throw new FormError("One of the fields is too long.");
  }
  return value;
}

function requiredText(
  formData: FormData,
  key: string,
  label: string,
  maxLength: number,
  minLength = 1,
) {
  const value = readText(formData, key, maxLength);
  if (value.length < minLength) {
    throw new FormError(`${label} is required.`);
  }
  return value;
}

function readQrCode(formData: FormData) {
  const qrCode = readText(formData, "qrCode", 128);
  if (!qrCodePattern.test(qrCode)) {
    throw new FormError("Invalid QR code.");
  }
  return qrCode;
}

function readStudentNumber(formData: FormData) {
  const studentNumber = requiredText(formData, "studentNumber", "Student number", 64, 3);
  if (!studentNumberPattern.test(studentNumber)) {
    throw new FormError("Enter a valid student number.");
  }
  return studentNumber.toUpperCase();
}

function readContact(formData: FormData) {
  const contact = requiredText(formData, "contact", "Contact number", 32, 7);
  if (!normalizeContactNumber(contact)) {
    throw new FormError("Enter a valid contact number (7-15 digits).");
  }
  return contact;
}

function readQuantity(formData: FormData) {
  const value = requiredText(formData, "requestedQuantity", "Quantity", 12);
  if (!/^\d+$/.test(value)) {
    throw new FormError("Quantity must be a whole number.");
  }
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxBorrowQuantity) {
    throw new FormError("Quantity has to be 1 to 1,000.");
  }
  return quantity;
}

function itemUnavailable(): never {
  throw new FormError("This item can't be borrowed right now.");
}

function isSerializationFailure(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

// don't leak db errors
function publicBorrowError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error;
  }
  if (error.code === "P2002") {
    return new FormError("You already sent this request. Refresh the page.");
  }
  if (error.code === "P2003" || error.code === "P2025") {
    return new FormError("This item just changed. Refresh and try again.");
  }
  return new FormError("Couldn't send the request. Try again or ask CEIT staff.");
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

async function createBorrowRequest(input: BorrowRequestInput) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const item = await tx.inventoryItem.findUnique({
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

          // lapsed requests don't count, students can't cancel them
          const now = new Date();
          const studentRequests = await tx.borrowRequest.findMany({
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
            throw new FormError("You have overdue equipment. Return it first.");
          }
          const openRequests = studentRequests.filter(
            (request) =>
              !isHoldLapsed(request, now, input.policy) &&
              (request.status === borrowStatus.BORROWED ||
                request.status === borrowStatus.RETURN_REQUESTED ||
                request.expectedReturnDate > now),
          );
          if (openRequests.length >= input.policy.maxActiveRequestsPerStudent) {
            throw new FormError(
              `You already have ${input.policy.maxActiveRequestsPerStudent} open requests or loans. Wait for those to finish first.`,
            );
          }
          const overlapsExisting = openRequests.some(
            (request) =>
              request.inventoryItemId === item.id &&
              request.startsAt < input.expectedReturnDate &&
              request.expectedReturnDate > input.startsAt,
          );
          if (overlapsExisting) {
            throw new FormError("You already have a request for this item.");
          }

          await checkLoanAvailability(
            tx,
            item.id,
            input.startsAt,
            input.expectedReturnDate,
            input.requestedQuantity,
          );

          const request = await tx.borrowRequest.create({
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
          await tx.inventoryAudit.create({
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
                ? "Reservation requested (QR)."
                : "Borrow requested (QR).",
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

export async function submitBorrowRequest(formData: FormData) {
  return formAction(async () => {
    if (readText(formData, "website", 255)) {
      throw new FormError("Couldn't send. Try again.");
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

    // validate before rate limiting so a typo doesn't use up the quota
    await enforcePublicRequestRateLimit(PublicRequestKind.BORROW);
    await createBorrowRequest(input);
    refreshInventoryViews();
    redirect(`/scan/${encodeURIComponent(qrCode)}?request=sent`);
  });
}

export async function submitReturnRequest(formData: FormData) {
  return formAction(async () => {
    if (readText(formData, "website", 255)) {
      throw new FormError("Couldn't send. Try again.");
    }

    const qrCode = readQrCode(formData);
    assertFormToken(`return:${qrCode}`, readText(formData, "formToken", 200));
    const studentNumber = readStudentNumber(formData);
    const contact = readContact(formData);
    const returnRequestNotes = readText(formData, "returnRequestNotes", 1_000);

    // same as borrow, validate first
    await enforcePublicRequestRateLimit(PublicRequestKind.RETURN);

    try {
      await prisma.$transaction(
        async (tx) => {
          const candidates = await tx.borrowRequest.findMany({
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
              "No loan found for these details. Check your student and contact numbers.",
            );
          }
          if (request.status === borrowStatus.RETURN_REQUESTED) {
            throw new FormError("You already sent a return request for this.");
          }
          await tx.borrowRequest.update({
            where: { id: request.id },
            data: {
              status: borrowStatus.RETURN_REQUESTED,
              returnRequestedAt: new Date(),
              returnRequestNotes: returnRequestNotes || null,
            },
          });
          await tx.inventoryAudit.create({
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
              summary: "Return requested (QR).",
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
