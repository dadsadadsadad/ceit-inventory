import {
  BorrowStatus,
  ItemCondition,
  ItemStatus,
  MaintenancePriority,
  MaintenanceStatus,
} from "@prisma/client";

import { borrowStatusLabel } from "@/lib/borrow-status";
import { groupSoftware, sortSoftwareGroups } from "@/lib/computer-directory";
import { loadSoftware } from "@/lib/computer-queries";
import { inventoryAttentionWhere } from "@/lib/inventory-attention";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { dueTodayWhere } from "@/lib/loan-due";
import { lowStockLevelFor } from "@/lib/stock-level";
import { lowStockWhere } from "@/lib/stock-queries";
import { warrantyWhere } from "@/lib/warranty";
import { prisma } from "@/prisma";

import { formatReportDateTime, formatReportDay, humanize, plural } from "../format";
import type { ReportModel, ReportTable } from "../model";
import type { BuilderContext } from "./shared";

const outStatuses = [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED];
const peso = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

function counts(heading: string, label: string, entries: [string, number][]): ReportTable {
  return {
    heading,
    columns: [
      { label, width: 3, primary: true },
      { label: "Records", width: 1, align: "right" },
    ],
    rows: entries.map(([name, count]) => [name, count.toLocaleString()]),
    total: entries.length,
    emptyText: "Nothing recorded yet.",
  };
}

function firstOf(heading: string, shown: number, total: number) {
  return total > shown ? `Showing the first ${shown} of ${total.toLocaleString()}.` : undefined;
}

// Where everything stands today. Nothing here depends on filters.
export async function buildOverviewReport(context: BuilderContext): Promise<ReportModel> {
  const { now } = context;
  const out = { status: { in: outStatuses } };
  const [
    summary,
    statusCounts,
    conditionCounts,
    categories,
    rooms,
    attentionCount,
    attentionItems,
    pcCount,
    openTicketCount,
    urgentTicketCount,
    outCount,
    overdueCount,
    openTickets,
    overdue,
    reservations,
    expiring,
    expired,
    lowStockCount,
    lowStockItems,
    warrantyEndingCount,
    warrantyEndingItems,
    dueToday,
  ] = await Promise.all([
    prisma.inventoryItem.aggregate({
      _count: { _all: true },
      _sum: { quantity: true, purchasePrice: true },
    }),
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.inventoryItem.groupBy({ by: ["condition"], _count: { _all: true } }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { name: true, _count: { select: { items: true } } },
    }),
    prisma.location.findMany({
      orderBy: { name: "asc" },
      select: { name: true, _count: { select: { items: true } } },
    }),
    prisma.inventoryItem.count({ where: inventoryAttentionWhere }),
    prisma.inventoryItem.findMany({
      where: inventoryAttentionWhere,
      include: { category: true, location: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 25,
    }),
    prisma.inventoryItem.count({ where: { isComputer: true } }),
    prisma.maintenanceTicket.count({ where: { status: MaintenanceStatus.OPEN } }),
    prisma.maintenanceTicket.count({
      where: {
        status: MaintenanceStatus.OPEN,
        priority: { in: [MaintenancePriority.HIGH, MaintenancePriority.URGENT] },
      },
    }),
    prisma.borrowRequest.count({ where: out }),
    prisma.borrowRequest.count({ where: { ...out, expectedReturnDate: { lt: now } } }),
    prisma.maintenanceTicket.findMany({
      where: { status: MaintenanceStatus.OPEN },
      include: { inventoryItem: { select: { assetTag: true, name: true } } },
      orderBy: [{ priority: "desc" }, { openedAt: "asc" }],
      take: 20,
    }),
    prisma.borrowRequest.findMany({
      where: { ...out, expectedReturnDate: { lt: now } },
      include: { inventoryItem: { select: { assetTag: true, name: true } } },
      orderBy: { expectedReturnDate: "asc" },
      take: 20,
    }),
    prisma.borrowRequest.findMany({
      where: { status: BorrowStatus.RESERVED, expectedReturnDate: { gt: now } },
      include: { inventoryItem: { select: { assetTag: true, name: true } } },
      orderBy: { startsAt: "asc" },
      take: 20,
    }),
    loadSoftware({ license: "expiring" }, now),
    loadSoftware({ license: "expired" }, now),
    prisma.inventoryItem.count({ where: lowStockWhere() }),
    prisma.inventoryItem.findMany({
      where: lowStockWhere(),
      include: { category: true, location: true },
      orderBy: [{ quantity: "asc" }, { name: "asc" }],
      take: 20,
    }),
    prisma.inventoryItem.count({ where: warrantyWhere("ending", now) }),
    prisma.inventoryItem.findMany({
      where: warrantyWhere("ending", now),
      include: { category: true, location: true },
      orderBy: { warrantyEndsAt: "asc" },
      take: 20,
    }),
    prisma.borrowRequest.findMany({
      where: dueTodayWhere(now),
      include: { inventoryItem: { select: { assetTag: true, name: true } } },
      orderBy: { expectedReturnDate: "asc" },
      take: 20,
    }),
  ]);

  const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const conditionMap = new Map(
    conditionCounts.map((entry) => [entry.condition, entry._count._all]),
  );
  const top = (entries: { _count: { items: number }; name: string }[]): [string, number][] =>
    entries
      .filter((entry) => entry._count.items > 0)
      .sort((a, b) => b._count.items - a._count.items)
      .slice(0, 12)
      .map((entry) => [entry.name, entry._count.items]);
  const licenseGroups = sortSoftwareGroups(
    groupSoftware([...expired.entries, ...expiring.entries], now),
    "expiry",
  ).slice(0, 15);
  const acquisition = Number(summary._sum.purchasePrice?.toString() ?? 0);

  return {
    kind: "overview",
    title: "Overview",
    description: "Where everything stands today.",
    filters: [],
    generatedAt: now,
    metrics: [
      { label: "Inventory records", value: summary._count._all.toLocaleString() },
      { label: "Units in stock", value: (summary._sum.quantity ?? 0).toLocaleString() },
      { label: "PCs and Macs", value: pcCount.toLocaleString() },
      {
        label: "Needs attention",
        value: attentionCount.toLocaleString(),
        tone: attentionCount ? "alert" : undefined,
      },
      { label: "Currently out", value: outCount.toLocaleString() },
      {
        label: "Overdue",
        value: overdueCount.toLocaleString(),
        tone: overdueCount ? "alert" : undefined,
      },
      {
        label: "Open repairs",
        value: openTicketCount.toLocaleString(),
        note: urgentTicketCount
          ? `${urgentTicketCount.toLocaleString()} high or urgent`
          : undefined,
        tone: urgentTicketCount ? "alert" : undefined,
      },
      {
        label: "Low stock",
        value: lowStockCount.toLocaleString(),
        tone: lowStockCount ? "alert" : undefined,
      },
      {
        label: "Warranty ending soon",
        value: warrantyEndingCount.toLocaleString(),
        tone: warrantyEndingCount ? "alert" : undefined,
      },
      { label: "Acquisition value", value: peso.format(acquisition) },
    ],
    tables: [
      {
        heading: "Needs attention",
        note: firstOf("Needs attention", attentionItems.length, attentionCount),
        columns: [
          { label: "Item", width: 1.5, primary: true },
          { label: "Category and room", width: 1.3 },
          { label: "Status", width: 1.05 },
          { label: "Last checked", width: 1.15 },
        ],
        rows: attentionItems.map((item) => [
          `${item.name}\n${item.assetTag ?? "No asset tag"}`,
          `${item.category.name}\n${item.location.name}`,
          `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}`,
          formatReportDateTime(item.lastCheckedAt),
        ]),
        total: attentionCount,
        emptyText: "Nothing needs attention right now.",
      },
      {
        heading: "Overdue loans",
        note: firstOf("Overdue loans", overdue.length, overdueCount),
        columns: [
          { label: "Item", width: 1.6, primary: true },
          { label: "Borrower", width: 1.25 },
          { label: "Return by", width: 1.1 },
          { label: "Status", width: 0.8 },
        ],
        rows: overdue.map((request) => [
          `${request.inventoryItem.name}\n${request.inventoryItem.assetTag ?? "No asset tag"}`,
          request.borrowerName,
          formatReportDateTime(request.expectedReturnDate),
          borrowStatusLabel(request.status),
        ]),
        total: overdueCount,
        emptyText: "No loans are overdue.",
      },
      {
        heading: "Due back today",
        columns: [
          { label: "Item", width: 1.6, primary: true },
          { label: "Borrower", width: 1.25 },
          { label: "Return by", width: 1.1 },
        ],
        rows: dueToday.map((request) => [
          `${request.inventoryItem.name}\n${request.inventoryItem.assetTag ?? "No asset tag"}`,
          request.borrowerName,
          formatReportDateTime(request.expectedReturnDate),
        ]),
        total: dueToday.length,
        emptyText: "Nothing is due back later today.",
      },
      {
        heading: "Low stock",
        note: firstOf("Low stock", lowStockItems.length, lowStockCount),
        columns: [
          { label: "Item", width: 2, primary: true },
          { label: "Left", width: 0.6, align: "right" },
          { label: "Alert at", width: 0.7, align: "right" },
        ],
        rows: lowStockItems.map((item) => [
          `${item.name}\n${item.category.name} · ${item.location.name}`,
          item.quantity.toLocaleString(),
          lowStockLevelFor(item).toLocaleString(),
        ]),
        total: lowStockCount,
        emptyText: "No stock is running low.",
      },
      {
        heading: "Warranty ending soon",
        note: firstOf("Warranty ending soon", warrantyEndingItems.length, warrantyEndingCount),
        columns: [
          { label: "Item", width: 2, primary: true },
          { label: "Warranty ends", width: 1.2 },
        ],
        rows: warrantyEndingItems.map((item) => [
          `${item.name}\n${item.category.name} · ${item.location.name}`,
          formatReportDay(item.warrantyEndsAt),
        ]),
        total: warrantyEndingCount,
        emptyText: "No warranties end within 60 days.",
      },
      {
        heading: "Open repairs",
        note: firstOf("Open repairs", openTickets.length, openTicketCount),
        columns: [
          { label: "Equipment", width: 1.9, primary: true },
          { label: "Priority", width: 0.85 },
          { label: "Reported", width: 1.25 },
        ],
        rows: openTickets.map((ticket) => [
          `${ticket.inventoryItem.name}\n${ticket.inventoryItem.assetTag ?? "No asset tag"}\n${ticket.title}`,
          humanize(ticket.priority),
          formatReportDateTime(ticket.openedAt),
        ]),
        total: openTicketCount,
        emptyText: "No open repairs.",
      },
      {
        heading: "Upcoming reservations",
        columns: [
          { label: "Item", width: 1.5, primary: true },
          { label: "Borrower", width: 1.2 },
          { label: "Pickup", width: 1.2 },
          { label: "Return by", width: 1.2 },
        ],
        rows: reservations.map((request) => [
          request.inventoryItem.name,
          request.borrowerName,
          formatReportDateTime(request.startsAt),
          formatReportDateTime(request.expectedReturnDate),
        ]),
        total: reservations.length,
        emptyText: "No upcoming reservations.",
      },
      {
        heading: "Software licenses to renew",
        note: licenseGroups.length
          ? `${plural(licenseGroups.length, "title")} expired or ending within 30 days.`
          : undefined,
        columns: [
          { label: "Software", width: 1.6, primary: true },
          { label: "PCs", width: 0.5, align: "right" },
          { label: "License", width: 1.4 },
        ],
        rows: licenseGroups.map((group) => [
          group.name,
          group.installs.length.toLocaleString(),
          `${group.state === "expired" ? "Expired" : "Ends"} ${formatReportDay(group.soonestExpiry)}`,
        ]),
        total: licenseGroups.length,
        emptyText: "No licenses are ending soon.",
      },
      counts(
        "Equipment status",
        "Status",
        Object.values(ItemStatus).map((status) => [
          inventoryStatusLabel(status),
          statusMap.get(status) ?? 0,
        ]),
      ),
      counts(
        "Equipment condition",
        "Condition",
        Object.values(ItemCondition).map((condition) => [
          humanize(condition),
          conditionMap.get(condition) ?? 0,
        ]),
      ),
      counts("Records by category", "Category", top(categories)),
      counts("Records by room", "Room", top(rooms)),
    ],
  };
}
