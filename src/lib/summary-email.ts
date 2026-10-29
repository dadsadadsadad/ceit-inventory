import "server-only";

import { BorrowStatus, ItemStatus, MaintenanceStatus } from "@prisma/client";

import { replacementDueWhere } from "./inventory-attention";
import { addDays, planDue, planScopeLabel } from "./maintenance-plans";
import { dueTodayWhere, outLoanStatuses } from "./loan-due";
import { formatManilaDate, manilaCalendarDate } from "./manila-date";
import { manilaWeekday, summaryDueOn, type SummaryTime } from "./notification-kinds";
import { appLink, sendMail } from "./notifications";
import { lowStockWhere } from "./stock-queries";
import { warrantyWhere } from "./warranty";
import { prisma } from "@/prisma";

const listed = 15;
const dayMs = 24 * 60 * 60 * 1000;
const day = (date: Date) => formatManilaDate(date, { day: "numeric", month: "short" });
const dayTime = (date: Date) => formatManilaDate(date, { dateStyle: "medium", timeStyle: "short" });

type Recipient = {
  email: string;
  notifyLater: string[];
  notifyOn: string[];
  summaryDay: number;
  summaryFrequency: string;
};

function section(title: string, lines: string[], link: string) {
  if (!lines.length) {
    return null;
  }
  const more = lines.length > listed ? [`...and ${lines.length - listed} more`] : [];
  return [
    `${title} (${lines.length})`,
    ...lines.slice(0, listed).map((line) => `- ${line}`),
    ...more,
    appLink(link),
  ].join("\n");
}

// days the summary should look back over, monday after a weekdays-only weekend covers 3
export function summaryPeriodDays(frequency: string, now: Date) {
  if (frequency === "weekly") {
    return 7;
  }
  return frequency === "weekdays" && manilaWeekday(now) === 1 ? 3 : 1;
}

export async function sendSummaries(time: SummaryTime, now = new Date()) {
  const users: Recipient[] = (
    await prisma.user.findMany({
      where: { isActive: true, summaryTime: time, summaryFrequency: { not: "off" } },
      select: {
        email: true,
        notifyLater: true,
        notifyOn: true,
        summaryDay: true,
        summaryFrequency: true,
      },
    })
  ).filter((user) => summaryDueOn(user, now));
  if (!users.length) {
    return 0;
  }

  const inService = { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } };
  const weekAhead = new Date(now.getTime() + 7 * dayMs);
  const weekAgo = new Date(now.getTime() - 7 * dayMs);
  const loanSelect = {
    borrowerName: true,
    expectedReturnDate: true,
    inventoryItem: { select: { name: true } },
  } as const;
  const [
    overdue,
    dueToday,
    dueThisWeek,
    lowStock,
    warranties,
    licenses,
    oldPcs,
    requests,
    returns,
    problems,
    plans,
  ] = await Promise.all([
    prisma.borrowRequest.findMany({
      where: { status: { in: outLoanStatuses }, expectedReturnDate: { lt: now } },
      select: loanSelect,
      orderBy: { expectedReturnDate: "asc" },
    }),
    prisma.borrowRequest.findMany({
      where: dueTodayWhere(now),
      select: loanSelect,
      orderBy: { expectedReturnDate: "asc" },
    }),
    prisma.borrowRequest.findMany({
      where: { status: { in: outLoanStatuses }, expectedReturnDate: { gte: now, lt: weekAhead } },
      select: loanSelect,
      orderBy: { expectedReturnDate: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: lowStockWhere(),
      select: { name: true, quantity: true },
      orderBy: { quantity: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { AND: [warrantyWhere("ending", now), inService] },
      select: { name: true, warrantyEndsAt: true },
      orderBy: { warrantyEndsAt: "asc" },
    }),
    prisma.computerSoftware.findMany({
      where: {
        licenseExpiresAt: { gte: now, lt: new Date(now.getTime() + 30 * dayMs) },
        computer: { item: inService },
      },
      select: {
        name: true,
        licenseExpiresAt: true,
        computer: { select: { item: { select: { name: true } } } },
      },
      orderBy: { licenseExpiresAt: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: replacementDueWhere(now),
      select: { name: true },
      orderBy: { purchaseDate: "asc" },
    }),
    prisma.borrowRequest.findMany({
      where: { status: BorrowStatus.REQUESTED },
      select: { borrowerName: true, requestedAt: true, inventoryItem: { select: { name: true } } },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.borrowRequest.findMany({
      where: { status: BorrowStatus.RETURN_REQUESTED },
      select: { borrowerName: true, inventoryItem: { select: { name: true } } },
      orderBy: { returnRequestedAt: "asc" },
    }),
    prisma.maintenanceTicket.findMany({
      where: { source: "QR", status: MaintenanceStatus.OPEN, openedAt: { gte: weekAgo } },
      select: { title: true, openedAt: true, inventoryItem: { select: { name: true } } },
      orderBy: { openedAt: "desc" },
    }),
    prisma.maintenancePlan.findMany({
      where: {
        isActive: true,
        nextDueOn: { lte: new Date(`${addDays(manilaCalendarDate(now), 7)}T00:00:00.000Z`) },
      },
      include: {
        category: { select: { name: true } },
        location: { select: { name: true } },
        item: { select: { name: true } },
      },
      orderBy: { nextDueOn: "asc" },
    }),
  ]);
  const today = manilaCalendarDate(now);

  let sent = 0;
  for (const user of users) {
    const wants = (kind: string) => user.notifyOn.includes(kind);
    const later = (kind: string) => wants(kind) && user.notifyLater.includes(kind);
    const weekly = user.summaryFrequency === "weekly";
    const since = new Date(now.getTime() - summaryPeriodDays(user.summaryFrequency, now) * dayMs);
    const due = weekly ? dueThisWeek : dueToday;

    const parts = [
      later("borrowRequests")
        ? section(
            "Requests waiting for review",
            requests.map(
              (entry) =>
                `${entry.inventoryItem.name}, ${entry.borrowerName}, asked ${dayTime(entry.requestedAt)}`,
            ),
            "/dashboard/borrowing?status=REQUESTED",
          )
        : null,
      later("returns")
        ? section(
            "Returns to confirm",
            returns.map((entry) => `${entry.inventoryItem.name}, ${entry.borrowerName}`),
            "/dashboard/borrowing?status=RETURN_REQUESTED",
          )
        : null,
      later("repairs")
        ? section(
            weekly ? "Problems reported this week" : "Problems reported",
            problems
              .filter((entry) => entry.openedAt >= since)
              .map((entry) => `${entry.inventoryItem.name}: ${entry.title}`),
            "/dashboard/maintenance?status=OPEN",
          )
        : null,
      ...(wants("dailyLoans")
        ? [
            section(
              "Overdue",
              overdue.map(
                (loan) =>
                  `${loan.inventoryItem.name}, ${loan.borrowerName}, due ${day(loan.expectedReturnDate)}`,
              ),
              "/dashboard/borrowing?status=OVERDUE",
            ),
            section(
              weekly ? "Due back in the next 7 days" : "Due back today",
              due.map(
                (loan) =>
                  `${loan.inventoryItem.name}, ${loan.borrowerName}, ${dayTime(loan.expectedReturnDate)}`,
              ),
              weekly
                ? "/dashboard/borrowing?status=BORROWED"
                : "/dashboard/borrowing?status=DUE_TODAY",
            ),
          ]
        : []),
      wants("dailyStock") || later("lowStock")
        ? section(
            "Low or out of stock",
            lowStock.map((item) => `${item.name}, ${item.quantity} left`),
            "/dashboard/inventory?stock=low",
          )
        : null,
      ...(wants("dailyUpkeep")
        ? [
            section(
              weekly ? "Preventive maintenance this week" : "Preventive maintenance due",
              plans
                .map((plan) => ({
                  plan,
                  due: planDue(plan.nextDueOn.toISOString().slice(0, 10), today),
                }))
                .filter(({ due }) => weekly || due.state === "overdue" || due.state === "today")
                .map(
                  ({ plan, due }) =>
                    `${plan.title}, ${planScopeLabel(plan)}, ${due.label.toLowerCase()}`,
                ),
              "/dashboard/maintenance?view=preventive",
            ),
            section(
              "Warranties ending soon",
              warranties.map((item) => `${item.name}, ${day(item.warrantyEndsAt!)}`),
              "/dashboard/inventory?warranty=ending",
            ),
            section(
              "Licenses ending within 30 days",
              licenses.map(
                (entry) =>
                  `${entry.name} on ${entry.computer.item.name}, ${day(entry.licenseExpiresAt!)}`,
              ),
              "/dashboard/inventory/software?license=expiring",
            ),
            section(
              "PCs due for replacement",
              oldPcs.map((item) => item.name),
              "/dashboard/inventory?age=old",
            ),
          ]
        : []),
    ].filter((part): part is string => Boolean(part));
    if (!parts.length) {
      continue;
    }
    try {
      await sendMail([user.email], {
        subject: `${weekly ? "Weekly" : "Daily"} summary, ${formatManilaDate(now, { day: "numeric", month: "long" })}`,
        lines: [parts.join("\n\n")],
      });
      sent += 1;
    } catch (error) {
      console.error("Couldn't send a summary", error);
    }
  }
  return sent;
}
