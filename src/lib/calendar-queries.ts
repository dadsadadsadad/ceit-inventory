import "server-only";

import { BorrowStatus, ItemStatus } from "@prisma/client";

import { prisma } from "@/prisma";

import { monthBounds, type CalendarEntry } from "./calendar";
import { manilaCalendarDate } from "./manila-date";

// A busy month is still a few dozen entries; the cap only stops a runaway query.
const perSource = 250;

function timeText(date: Date) {
  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

/**
 * Everything the calendar shows for one month: loans coming back, reservations to hand over,
 * software licenses and warranties that end, and the events staff added themselves.
 */
export async function loadCalendarMonth(month: string, now = new Date()): Promise<CalendarEntry[]> {
  const { start, end, startDay, endDay } = monthBounds(month);
  const [returns, pickups, licenses, warranties, events] = await Promise.all([
    prisma.borrowRequest.findMany({
      where: {
        status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
        expectedReturnDate: { gte: start, lt: end },
      },
      select: {
        id: true,
        borrowerName: true,
        expectedReturnDate: true,
        inventoryItem: { select: { name: true } },
      },
      orderBy: { expectedReturnDate: "asc" },
      take: perSource,
    }),
    prisma.borrowRequest.findMany({
      where: {
        status: { in: [BorrowStatus.RESERVED, BorrowStatus.REQUESTED] },
        isReservation: true,
        startsAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        borrowerName: true,
        startsAt: true,
        status: true,
        inventoryItem: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
      take: perSource,
    }),
    prisma.computerSoftware.findMany({
      where: {
        licenseExpiresAt: { gte: startDay, lt: endDay },
        computer: { item: { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } } },
      },
      select: {
        id: true,
        name: true,
        licenseExpiresAt: true,
        computer: { select: { item: { select: { id: true, name: true } } } },
      },
      orderBy: { licenseExpiresAt: "asc" },
      take: perSource,
    }),
    prisma.inventoryItem.findMany({
      where: {
        warrantyEndsAt: { gte: startDay, lt: endDay },
        status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] },
      },
      select: { id: true, name: true, assetTag: true, warrantyEndsAt: true },
      orderBy: { warrantyEndsAt: "asc" },
      take: perSource,
    }),
    prisma.calendarEvent.findMany({
      where: { eventDate: { gte: startDay, lt: endDay } },
      select: { id: true, title: true, notes: true, eventDate: true },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      take: perSource,
    }),
  ]);

  const entries: CalendarEntry[] = [];
  for (const loan of returns) {
    entries.push({
      day: manilaCalendarDate(loan.expectedReturnDate),
      detail: `${loan.borrowerName} · ${timeText(loan.expectedReturnDate)}`,
      href: `/dashboard/borrowing?q=${encodeURIComponent(loan.inventoryItem.name)}`,
      id: `return:${loan.id}`,
      kind: "return",
      late: loan.expectedReturnDate < now,
      title: loan.inventoryItem.name,
    });
  }
  for (const booking of pickups) {
    entries.push({
      day: manilaCalendarDate(booking.startsAt),
      detail: `${booking.borrowerName} · ${timeText(booking.startsAt)}${booking.status === BorrowStatus.REQUESTED ? " · waiting for approval" : ""}`,
      href: `/dashboard/borrowing?q=${encodeURIComponent(booking.inventoryItem.name)}`,
      id: `pickup:${booking.id}`,
      kind: "pickup",
      title: booking.inventoryItem.name,
    });
  }
  for (const license of licenses) {
    entries.push({
      day: license.licenseExpiresAt!.toISOString().slice(0, 10),
      detail: license.computer.item.name,
      href: `/dashboard/inventory/${license.computer.item.id}`,
      id: `license:${license.id}`,
      kind: "license",
      title: license.name,
    });
  }
  for (const item of warranties) {
    entries.push({
      day: item.warrantyEndsAt!.toISOString().slice(0, 10),
      detail: item.assetTag ?? undefined,
      href: `/dashboard/inventory/${item.id}`,
      id: `warranty:${item.id}`,
      kind: "warranty",
      title: item.name,
    });
  }
  for (const event of events) {
    entries.push({
      day: event.eventDate.toISOString().slice(0, 10),
      detail: event.notes ?? undefined,
      eventId: event.id,
      id: `event:${event.id}`,
      kind: "event",
      title: event.title,
    });
  }
  return entries;
}
