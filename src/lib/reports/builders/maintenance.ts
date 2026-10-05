import { MaintenancePriority, MaintenanceStatus, type Prisma } from "@prisma/client";

import { maintenanceSearchWhere } from "@/lib/record-search";
import { reportDateFilter } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

import { chips, dateRangeChip, formatReportDateTime, humanize, plural } from "../format";
import type { ReportModel } from "../model";
import { loadCapped, type BuilderContext } from "./shared";

const dayMs = 24 * 60 * 60 * 1000;
const urgent = [MaintenancePriority.HIGH, MaintenancePriority.URGENT];

// Reported problems and repairs.
export async function buildMaintenanceReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const range = reportDateFilter(filters.dateRange);
  const where: Prisma.MaintenanceTicketWhereInput = {
    AND: [
      ...(range ? [{ openedAt: range }] : []),
      ...(filters.maintenanceSource ? [{ source: filters.maintenanceSource }] : []),
      ...(filters.maintenanceStatus ? [{ status: filters.maintenanceStatus }] : []),
      ...(filters.maintenancePriority ? [{ priority: filters.maintenancePriority }] : []),
      ...maintenanceSearchWhere(filters.query),
    ],
  };
  const open = { status: MaintenanceStatus.OPEN };

  const [{ rows: tickets, total }, openCount, urgentCount, resolvedTickets] = await Promise.all([
    loadCapped(context, {
      find: (take) =>
        prisma.maintenanceTicket.findMany({
          where,
          include: { inventoryItem: { select: { assetTag: true, name: true } } },
          orderBy: { openedAt: "desc" },
          take,
        }),
      count: () => prisma.maintenanceTicket.count({ where }),
    }),
    prisma.maintenanceTicket.count({ where: { AND: [where, open] } }),
    prisma.maintenanceTicket.count({
      where: { AND: [where, open, { priority: { in: urgent } }] },
    }),
    prisma.maintenanceTicket.findMany({
      where: { AND: [where, { status: MaintenanceStatus.RESOLVED, resolvedAt: { not: null } }] },
      select: { openedAt: true, resolvedAt: true },
      take: 5_000,
    }),
  ]);
  const days = resolvedTickets.map(
    (ticket) =>
      ((ticket.resolvedAt ?? ticket.openedAt).getTime() - ticket.openedAt.getTime()) / dayMs,
  );
  const average = days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : null;

  return {
    kind: "maintenance",
    title: "Maintenance",
    description: "Reported problems and repairs, and how long they stayed open.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      filters.maintenanceStatus &&
        `Status: ${filters.maintenanceStatus === "OPEN" ? "Needs attention" : "Resolved"}`,
      filters.maintenancePriority && `Priority: ${humanize(filters.maintenancePriority)}`,
      filters.maintenanceSource &&
        `Source: ${filters.maintenanceSource === "QR" ? "QR issue reports" : "Staff"}`,
      dateRangeChip(filters.dateRange, "Reported"),
    ),
    generatedAt: now,
    metrics: [
      { label: "Requests", value: total.toLocaleString() },
      {
        label: "Needs attention",
        value: openCount.toLocaleString(),
        tone: openCount ? "alert" : undefined,
      },
      {
        label: "High or urgent",
        value: urgentCount.toLocaleString(),
        tone: urgentCount ? "alert" : undefined,
      },
      {
        label: "Average time to fix",
        value:
          average === null ? "No repairs yet" : plural(Math.max(1, Math.round(average)), "day"),
      },
    ],
    tables: [
      {
        heading: "Requests",
        columns: [
          { label: "Equipment", width: 1.3, primary: true },
          { label: "Priority", width: 0.85 },
          { label: "Reported by", width: 1 },
          { label: "Dates", width: 1.2 },
          { label: "Details", width: 1.6 },
        ],
        rows: tickets.map((ticket) => [
          `${ticket.inventoryItem.name}\n${ticket.inventoryItem.assetTag ?? "No asset tag"}\n${ticket.title}`,
          `${humanize(ticket.priority)}\n${ticket.status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved"}`,
          ticket.source === "QR" ? "QR issue report" : (ticket.reportedByName ?? "Staff"),
          [
            `Reported ${formatReportDateTime(ticket.openedAt)}`,
            ticket.resolvedAt
              ? `Resolved ${formatReportDateTime(ticket.resolvedAt)}`
              : `Open for ${plural(Math.max(0, Math.floor((now.getTime() - ticket.openedAt.getTime()) / dayMs)), "day")}`,
          ].join("\n"),
          [ticket.description, ticket.resolutionNotes && `Staff: ${ticket.resolutionNotes}`]
            .filter(Boolean)
            .join("\n"),
        ]),
        total,
        emptyText: "No maintenance requests match these filters.",
      },
    ],
    csv: [
      [
        "Item",
        "Asset tag",
        "Title",
        "Priority",
        "Status",
        "Description",
        "Reported by",
        "Reported",
        "Resolved",
        "Staff notes",
        "Source",
      ],
      ...tickets.map((ticket) => [
        ticket.inventoryItem.name,
        ticket.inventoryItem.assetTag,
        ticket.title,
        humanize(ticket.priority),
        ticket.status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved",
        ticket.description,
        ticket.reportedByName,
        ticket.openedAt,
        ticket.resolvedAt,
        ticket.resolutionNotes,
        ticket.source === "QR" ? "QR issue report" : "Staff",
      ]),
    ],
  };
}
