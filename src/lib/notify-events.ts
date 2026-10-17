import "server-only";

import { formatManilaDate } from "./manila-date";
import { notifyStaff } from "./notifications";
import { prisma } from "@/prisma";

const when = (date: Date) => formatManilaDate(date, { dateStyle: "medium", timeStyle: "short" });

async function itemLabel(qrCode: string) {
  const item = await prisma.inventoryItem.findUnique({
    where: { qrCode },
    select: { name: true, assetTag: true, location: { select: { name: true } } },
  });
  return item
    ? {
        name: item.name,
        line: `Item: ${[item.name, item.assetTag].filter(Boolean).join(" · ")} (${item.location.name})`,
      }
    : null;
}

// run these with after() so the student's page doesn't wait on email

export async function notifyBorrowRequest(
  qrCode: string,
  request: {
    borrowerName: string;
    expectedReturnDate: Date;
    isReservation: boolean;
    purpose: string;
    startsAt: Date;
  },
) {
  const item = await itemLabel(qrCode);
  if (!item) {
    return;
  }
  await notifyStaff("borrowRequests", {
    subject: `${request.isReservation ? "Reservation" : "Borrow"} request: ${item.name}`,
    lines: [
      item.line,
      `Borrower: ${request.borrowerName}`,
      `${request.isReservation ? "Pickup" : "From"}: ${when(request.startsAt)}`,
      `Return by: ${when(request.expectedReturnDate)}`,
      `Purpose: ${request.purpose}`,
    ],
    link: "/dashboard/borrowing?status=REQUESTED",
  });
}

export async function notifyReturnRequest(qrCode: string) {
  const item = await itemLabel(qrCode);
  if (!item) {
    return;
  }
  await notifyStaff("returns", {
    subject: `Return to confirm: ${item.name}`,
    lines: [item.line, "A student says they returned this. Check it and confirm the return."],
    link: "/dashboard/borrowing?status=RETURN_REQUESTED",
  });
}

export async function notifyProblemReport(
  qrCode: string,
  report: { description: string; reporterName: string; title: string },
) {
  const item = await itemLabel(qrCode);
  if (!item) {
    return;
  }
  await notifyStaff("repairs", {
    subject: `Problem reported: ${item.name}`,
    lines: [
      item.line,
      `Problem: ${report.title}`,
      `Details: ${report.description}`,
      `Reported by: ${report.reporterName}`,
    ],
    link: "/dashboard/maintenance?status=OPEN",
  });
}
