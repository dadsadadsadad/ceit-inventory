import { MaintenancePriority, MaintenanceStatus, type Prisma } from "@prisma/client";

import { maintenanceSearchWhere } from "@/lib/record-search";
import { reportDateFilter } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

import {
  chips,
  dateRangeChip,
  formatPesoShort,
  formatReportDateTime,
  humanize,
  plural,
} from "../format";
import type { ReportModel } from "../model";
import { countChart, monthChart } from "../charts";
import { loadCapped, monthlyCounts, namedItemCounts, type BuilderContext } from "./shared";

const dayMs = 24 * 60 * 60 * 1000;
const urgent = [MaintenancePriority.HIGH, MaintenancePriority.URGENT];

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

  const [
    { rows: tickets, total },
    openCount,
    urgentCount,
    resolvedTickets,
    byPriority,
    byMonth,
    topItems,
    openTickets,
    repeats,
  ] = await Promise.all([
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
    prisma.maintenanceTicket.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    monthlyCounts(now, (openedAt) =>
      prisma.maintenanceTicket.count({ where: { AND: [where, { openedAt }] } }),
    ),
    prisma.maintenanceTicket
      .groupBy({
        by: ["inventoryItemId"],
        where,
        _count: { _all: true },
        orderBy: { _count: { inventoryItemId: "desc" } },
        take: 7,
      })
      .then((groups) =>
        namedItemCounts(
          groups.map((group) => ({
            inventoryItemId: group.inventoryItemId,
            count: group._count._all,
          })),
        ),
      ),
    prisma.maintenanceTicket.findMany({
      where: { AND: [where, open] },
      select: {
        openedAt: true,
        inventoryItemId: true,
        inventoryItem: { select: { purchasePrice: true } },
      },
      take: 5_000,
    }),
    // items reported more than once
    prisma.maintenanceTicket
      .groupBy({
        by: ["inventoryItemId"],
        where,
        _count: { _all: true },
        _max: { openedAt: true },
        having: { inventoryItemId: { _count: { gt: 1 } } },
        orderBy: { _count: { inventoryItemId: "desc" } },
        take: 25,
      })
      .then(async (groups) => {
        const named = await namedItemCounts(
          groups.map((group) => ({
            inventoryItemId: group.inventoryItemId,
            count: group._count._all,
          })),
        );
        return groups.map((group, index) => ({
          name: named[index][0],
          count: group._count._all,
          last: group._max.openedAt,
        }));
      }),
  ]);
  const ageBands = [
    { label: "Under a week", below: 7 },
    { label: "1 to 4 weeks", below: 30 },
    { label: "1 to 3 months", below: 90 },
    { label: "Over 3 months", below: Number.POSITIVE_INFINITY },
  ];
  const waiting = ageBands.map(
    (band, index) =>
      openTickets.filter((ticket) => {
        const age = (now.getTime() - ticket.openedAt.getTime()) / dayMs;
        return age < band.below && (index === 0 || age >= ageBands[index - 1].below);
      }).length,
  );
  const brokenValue = [
    ...new Map(
      openTickets.map((ticket) => [
        ticket.inventoryItemId,
        Number(ticket.inventoryItem.purchasePrice?.toString() ?? 0),
      ]),
    ).values(),
  ].reduce((sum, value) => sum + value, 0);
  const priorityCount = new Map(byPriority.map((entry) => [entry.priority, entry._count._all]));
  const days = resolvedTickets.map(
    (ticket) =>
      ((ticket.resolvedAt ?? ticket.openedAt).getTime() - ticket.openedAt.getTime()) / dayMs,
  );
  const average = days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : null;

  return {
    kind: "maintenance",
    title: "Maintenance",
    description: "Repairs and how long they took.",
    filters: chips(
      filters.query && `Search: "${filters.query}"`,
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
      {
        label: "Waiting over a month",
        value: (waiting[2] + waiting[3]).toLocaleString(),
        tone: waiting[2] + waiting[3] ? "alert" : undefined,
      },
      {
        label: "Value awaiting repair",
        value: formatPesoShort(brokenValue),
        note: "equipment with an open request",
      },
      {
        label: "Repeat problems",
        value: repeats.length.toLocaleString(),
        note: "equipment reported more than once",
        tone: repeats.length ? "alert" : undefined,
      },
    ],
    charts: [
      monthChart("Requests reported per month", byMonth, "requests"),
      {
        title: "Requests by priority",
        kind: "bars",
        unit: "requests",
        data: Object.values(MaintenancePriority)
          .slice()
          .reverse()
          .map((priority) => ({
            label: humanize(priority),
            value: priorityCount.get(priority) ?? 0,
          })),
      },
      countChart("Most reported equipment", topItems, "requests", 7),
      {
        title: "How long open requests have waited",
        kind: "bars",
        unit: "requests",
        data: ageBands.map((band, index) => ({
          label: band.label,
          value: waiting[index],
          tone: index >= 2 ? ("defective" as const) : undefined,
        })),
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
          ticket.source === "QR"
            ? ticket.reportedByName
              ? `${ticket.reportedByName}\nQR report`
              : "QR report"
            : (ticket.reportedByName ?? "Staff"),
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
        emptyText: "No requests found.",
      },
      {
        heading: "Repeat problems",
        note: "Items reported more than once.",
        columns: [
          { label: "Equipment", width: 2.2, primary: true },
          { label: "Requests", width: 0.8, align: "right" },
          { label: "Last reported", width: 1.2 },
        ],
        rows: repeats.map((entry) => [
          entry.name,
          entry.count.toLocaleString(),
          formatReportDateTime(entry.last),
        ]),
        total: repeats.length,
        emptyText: "No repeat reports.",
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
