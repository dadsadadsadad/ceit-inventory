import { timingSafeEqual } from "node:crypto";
import { BorrowStatus, ItemStatus } from "@prisma/client";

import { replacementDueWhere } from "@/lib/inventory-attention";
import { dueTodayWhere } from "@/lib/loan-due";
import { formatManilaDate } from "@/lib/manila-date";
import type { NotificationKind } from "@/lib/notification-kinds";
import { appLink, mailConfigured, sendMail } from "@/lib/notifications";
import { lowStockWhere } from "@/lib/stock-queries";
import { warrantyWhere } from "@/lib/warranty";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listed = 15;
const dayMs = 24 * 60 * 60 * 1000;
const day = (date: Date) => formatManilaDate(date, { day: "numeric", month: "short" });

// vercel cron sends the CRON_SECRET as a bearer token
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const sent = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return (
    Boolean(secret) &&
    sent.length === expected.length &&
    timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
  );
}

function section(title: string, lines: string[], total: number, link: string) {
  if (!total) {
    return null;
  }
  const more = total > lines.length ? [`...and ${total - lines.length} more`] : [];
  return [`${title} (${total})`, ...lines.map((line) => `- ${line}`), ...more, appLink(link)].join(
    "\n",
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new Response(null, { status: 401 });
  }
  if (!mailConfigured()) {
    return Response.json({ sent: 0, reason: "mail not set up" });
  }
  const now = new Date();
  const outStatuses = [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED];
  const inService = { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } };
  const [overdue, dueToday, lowStock, warranties, licenses, oldPcs, users] = await Promise.all([
    prisma.borrowRequest.findMany({
      where: { status: { in: outStatuses }, expectedReturnDate: { lt: now } },
      select: {
        borrowerName: true,
        expectedReturnDate: true,
        inventoryItem: { select: { name: true } },
      },
      orderBy: { expectedReturnDate: "asc" },
    }),
    prisma.borrowRequest.findMany({
      where: dueTodayWhere(now),
      select: {
        borrowerName: true,
        expectedReturnDate: true,
        inventoryItem: { select: { name: true } },
      },
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
    prisma.user.findMany({
      where: { isActive: true, notifyOn: { hasSome: ["dailyLoans", "dailyStock", "dailyUpkeep"] } },
      select: { email: true, notifyOn: true },
    }),
  ]);

  const sections: Record<Extract<NotificationKind, `daily${string}`>, (string | null)[]> = {
    dailyLoans: [
      section(
        "Overdue",
        overdue
          .slice(0, listed)
          .map(
            (loan) =>
              `${loan.inventoryItem.name}, ${loan.borrowerName}, due ${day(loan.expectedReturnDate)}`,
          ),
        overdue.length,
        "/dashboard/borrowing?status=OVERDUE",
      ),
      section(
        "Due back today",
        dueToday.slice(0, listed).map((loan) => `${loan.inventoryItem.name}, ${loan.borrowerName}`),
        dueToday.length,
        "/dashboard/borrowing?status=DUE_TODAY",
      ),
    ],
    dailyStock: [
      section(
        "Low or out of stock",
        lowStock.slice(0, listed).map((item) => `${item.name}, ${item.quantity} left`),
        lowStock.length,
        "/dashboard/inventory?stock=low",
      ),
    ],
    dailyUpkeep: [
      section(
        "Warranties ending soon",
        warranties.slice(0, listed).map((item) => `${item.name}, ${day(item.warrantyEndsAt!)}`),
        warranties.length,
        "/dashboard/inventory?warranty=ending",
      ),
      section(
        "Licenses ending within 30 days",
        licenses
          .slice(0, listed)
          .map(
            (entry) =>
              `${entry.name} on ${entry.computer.item.name}, ${day(entry.licenseExpiresAt!)}`,
          ),
        licenses.length,
        "/dashboard/inventory/software?license=expiring",
      ),
      section(
        "PCs due for replacement",
        oldPcs.slice(0, listed).map((item) => item.name),
        oldPcs.length,
        "/dashboard/inventory?age=old",
      ),
    ],
  };

  let sent = 0;
  for (const user of users) {
    const parts = (Object.keys(sections) as (keyof typeof sections)[])
      .filter((kind) => user.notifyOn.includes(kind))
      .flatMap((kind) => sections[kind])
      .filter((part): part is string => Boolean(part));
    if (!parts.length) {
      continue;
    }
    try {
      await sendMail([user.email], {
        subject: `Daily summary, ${formatManilaDate(now, { day: "numeric", month: "long" })}`,
        lines: [parts.join("\n\n")],
      });
      sent += 1;
    } catch (error) {
      console.error("Couldn't send a daily summary", error);
    }
  }
  return Response.json({ sent });
}
