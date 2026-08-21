"use server";

import { AuditAction, ItemStatus, ItemType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { borrowStatus } from "@/lib/borrow-status";
import { prisma } from "@/prisma";

const qrCodePattern = /^[a-z0-9_-]{8,128}$/i;
const studentNumberPattern = /^[a-z0-9][a-z0-9./-]*$/i;
const contactPattern = /^[0-9+()\-\s]{7,32}$/;
const maximumBorrowQuantity = 1_000;
const maximumBorrowDurationDays = 366;

function readText(formData: FormData, key: string, maximumLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maximumLength) throw new Error("One of the submitted fields is too long.");
  return value;
}

function requiredText(formData: FormData, key: string, label: string, maximumLength: number, minimumLength = 1) {
  const value = readText(formData, key, maximumLength);
  if (value.length < minimumLength) throw new Error(`${label} is required.`);
  return value;
}

function readQrCode(formData: FormData) {
  const qrCode = readText(formData, "qrCode", 128);
  if (!qrCodePattern.test(qrCode)) throw new Error("This QR code is not valid.");
  return qrCode;
}

function readStudentNumber(formData: FormData) {
  const studentNumber = requiredText(formData, "studentNumber", "Student number", 64, 3);
  if (!studentNumberPattern.test(studentNumber)) throw new Error("Enter a valid student number.");
  return studentNumber.toUpperCase();
}

function readContact(formData: FormData) {
  const contact = requiredText(formData, "contact", "Contact number", 32, 7);
  if (!contactPattern.test(contact)) throw new Error("Enter a valid contact number.");
  return contact;
}

function readQuantity(formData: FormData) {
  const value = requiredText(formData, "requestedQuantity", "Quantity", 12);
  if (!/^\d+$/.test(value)) throw new Error("Quantity must be a whole number.");
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maximumBorrowQuantity) {
    throw new Error("Choose a quantity between 1 and 1,000.");
  }
  return quantity;
}

function manilaCalendarDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readExpectedReturnDate(formData: FormData) {
  const value = requiredText(formData, "expectedReturnDate", "Expected return date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected return date must use YYYY-MM-DD.");

  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid expected return date.");
  }

  const today = manilaCalendarDate(new Date());
  const latestDate = new Date(`${today}T12:00:00.000Z`);
  latestDate.setUTCDate(latestDate.getUTCDate() + maximumBorrowDurationDays);
  if (value <= today) throw new Error("Expected return date must be after today.");
  if (parsed > latestDate) throw new Error("Expected return date must be within the next year.");
  return parsed;
}

function itemUnavailable(): never {
  throw new Error("This item is not currently available for a borrowing request.");
}

function canBeBorrowed(status: ItemStatus) {
  return status === ItemStatus.OK || status === ItemStatus.WORKING;
}

function isSerializationFailure(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

type BorrowRequestInput = {
  borrowerName: string;
  contact: string;
  expectedReturnDate: Date;
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
        if (item.itemType !== ItemType.ASSET || !item.category.isActive || !item.location.isActive || !canBeBorrowed(item.status) || item.quantity < 1) {
          itemUnavailable();
        }

        const activeStatuses = [borrowStatus.REQUESTED, borrowStatus.BORROWED];
        const existingRequest = await transaction.borrowRequest.findFirst({
          where: {
            inventoryItemId: item.id,
            studentNumber: input.studentNumber,
            status: { in: activeStatuses },
          },
          select: { id: true },
        });
        if (existingRequest) throw new Error("You already have an active request for this item.");

        const reserved = await transaction.borrowRequest.aggregate({
          where: { inventoryItemId: item.id, status: borrowStatus.REQUESTED },
          _sum: { requestedQuantity: true },
        });
        const availableQuantity = item.quantity - (reserved._sum.requestedQuantity ?? 0);
        if (input.requestedQuantity > availableQuantity) {
          throw new Error("The requested quantity is no longer available.");
        }

        await transaction.borrowRequest.create({
          data: {
            inventoryItemId: item.id,
            borrowerName: input.borrowerName,
            studentNumber: input.studentNumber,
            contact: input.contact,
            purpose: input.purpose,
            requestedQuantity: input.requestedQuantity,
            expectedReturnDate: input.expectedReturnDate,
            status: borrowStatus.REQUESTED,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (attempt === 0 && isSerializationFailure(error)) continue;
      throw error;
    }
  }
}

export async function submitBorrowRequest(formData: FormData) {
  if (readText(formData, "website", 255)) throw new Error("Unable to submit this request. Please try again.");

  const qrCode = readQrCode(formData);
  const input: BorrowRequestInput = {
    qrCode,
    borrowerName: requiredText(formData, "borrowerName", "Full name", 120, 2),
    studentNumber: readStudentNumber(formData),
    contact: readContact(formData),
    purpose: requiredText(formData, "purpose", "Borrowing purpose", 1_000, 5),
    requestedQuantity: readQuantity(formData),
    expectedReturnDate: readExpectedReturnDate(formData),
  };

  await createBorrowRequest(input);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/borrowing");
  redirect(`/scan/${encodeURIComponent(qrCode)}?request=sent`);
}

export async function submitReturnRequest(formData: FormData) {
  if (readText(formData, "website", 255)) throw new Error("Unable to submit this request. Please try again.");

  const qrCode = readQrCode(formData);
  const studentNumber = readStudentNumber(formData);
  const contact = readContact(formData);
  const returnRequestNotes = readText(formData, "returnRequestNotes", 1_000);

  await prisma.$transaction(async (transaction) => {
    const request = await transaction.borrowRequest.findFirst({
      where: {
        studentNumber,
        contact,
        status: borrowStatus.BORROWED,
        inventoryItem: { is: { qrCode } },
      },
      select: { id: true, inventoryItemId: true },
    });
    if (!request) return;
    await transaction.borrowRequest.update({
      where: { id: request.id },
      data: { status: borrowStatus.RETURN_REQUESTED, returnRequestedAt: new Date(), returnRequestNotes: returnRequestNotes || null },
    });
    await transaction.inventoryAudit.create({
      data: {
        itemId: request.inventoryItemId,
        action: AuditAction.UPDATED,
        summary: "Borrower submitted a QR return request.",
        metadata: { borrowRequestId: request.id, transition: borrowStatus.RETURN_REQUESTED, source: "public-qr" },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/borrowing");
  revalidatePath(`/scan/${encodeURIComponent(qrCode)}`);
  redirect(`/scan/${encodeURIComponent(qrCode)}?return=sent`);
}
