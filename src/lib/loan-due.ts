import { BorrowStatus, type Prisma } from "@prisma/client";

import { startOfManilaDay } from "./manila-date";

const dayMs = 24 * 60 * 60 * 1000;

/** Loans that are out right now. A return request is still a loan until staff confirm it. */
export const outLoanStatuses: BorrowStatus[] = [
  BorrowStatus.BORROWED,
  BorrowStatus.RETURN_REQUESTED,
];

/** Loans due back later today (Philippine time) that are not yet late. */
export function dueTodayWhere(now = new Date()): Prisma.BorrowRequestWhereInput {
  const endOfToday = new Date(startOfManilaDay(now).getTime() + dayMs);
  return {
    status: { in: outLoanStatuses },
    expectedReturnDate: { gte: now, lt: endOfToday },
  };
}

/** The text staff can send a borrower: friendly, specific, and with no private details. */
export function reminderMessage(input: {
  borrowerName: string;
  dueAt: Date;
  itemName: string;
  late: boolean;
  now?: Date;
}) {
  const first = input.borrowerName.trim().split(/\s+/)[0] || "there";
  const when = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(input.dueAt);
  return input.late
    ? `Hi ${first}, this is CEIT. "${input.itemName}" was due back on ${when}. Please return it to the CEIT office as soon as you can. Thank you!`
    : `Hi ${first}, this is a reminder from CEIT that "${input.itemName}" is due back on ${when}. Please return it to the CEIT office on time. Thank you!`;
}
