import {
  BorrowStatus,
  ItemCondition,
  ItemStatus,
  MaintenancePriority,
  MaintenanceStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/prisma";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { borrowStatusLabel } from "@/lib/borrow-status";
import { formatReportDate, formatReportDateTime, humanize } from "../format";
import { documentResponse, reportDocument, mutedColor } from "../pdf-writer";

// Current inventory and outstanding work.
export async function createOverviewPdf(canManage: boolean, calendarDate: string) {
  const today = new Date();
  const inspectionCutoff = new Date(today);
  inspectionCutoff.setDate(inspectionCutoff.getDate() - 90);
  const attentionWhere: Prisma.InventoryItemWhereInput = {
    OR: [
      { status: { in: [ItemStatus.DEFECTIVE, ItemStatus.NOT_TESTED] } },
      { condition: { in: [ItemCondition.POOR, ItemCondition.FOR_REPAIR] } },
    ],
  };
  const [
    inventorySummary,
    statusCounts,
    conditionCounts,
    categoryCounts,
    locationCounts,
    attentionCount,
    attentionItems,
    pcCount,
    stalePcCount,
    openTicketCount,
    urgentTicketCount,
    activeBorrowCount,
    overdueBorrowCount,
    openTickets,
    overdueBorrows,
    reservations,
    qrIssueCount,
    reservationCount,
  ] = await Promise.all([
    prisma.inventoryItem.aggregate({
      _count: { _all: true, purchasePrice: true },
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
    prisma.inventoryItem.count({ where: attentionWhere }),
    prisma.inventoryItem.findMany({
      where: attentionWhere,
      include: { category: true, location: true },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 25,
    }),
    prisma.inventoryItem.count({ where: { isComputer: true } }),
    prisma.inventoryItem.count({
      where: {
        isComputer: true,
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: inspectionCutoff } }],
      },
    }),
    canManage
      ? prisma.maintenanceTicket.count({ where: { status: MaintenanceStatus.OPEN } })
      : Promise.resolve(0),
    canManage
      ? prisma.maintenanceTicket.count({
          where: {
            status: MaintenanceStatus.OPEN,
            priority: { in: [MaintenancePriority.HIGH, MaintenancePriority.URGENT] },
          },
        })
      : Promise.resolve(0),
    canManage
      ? prisma.borrowRequest.count({
          where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] } },
        })
      : Promise.resolve(0),
    canManage
      ? prisma.borrowRequest.count({
          where: {
            status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
            expectedReturnDate: { lt: today },
          },
        })
      : Promise.resolve(0),
    canManage
      ? prisma.maintenanceTicket.findMany({
          where: { status: MaintenanceStatus.OPEN },
          include: { inventoryItem: { select: { assetTag: true, name: true } } },
          orderBy: [{ priority: "desc" }, { openedAt: "asc" }],
          take: 20,
        })
      : Promise.resolve([]),
    canManage
      ? prisma.borrowRequest.findMany({
          where: {
            status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
            expectedReturnDate: { lt: today },
          },
          include: { inventoryItem: { select: { assetTag: true, name: true } } },
          orderBy: { expectedReturnDate: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
    canManage
      ? prisma.borrowRequest.findMany({
          where: { status: BorrowStatus.RESERVED, expectedReturnDate: { gt: today } },
          include: { inventoryItem: { select: { assetTag: true, name: true } } },
          orderBy: { startsAt: "asc" },
          take: 21,
        })
      : Promise.resolve([]),
    canManage
      ? prisma.maintenanceTicket.count({ where: { status: MaintenanceStatus.OPEN, source: "QR" } })
      : Promise.resolve(0),
    canManage
      ? prisma.borrowRequest.count({
          where: { status: BorrowStatus.RESERVED, expectedReturnDate: { gt: today } },
        })
      : Promise.resolve(0),
  ]);
  const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const conditionMap = new Map(
    conditionCounts.map((entry) => [entry.condition, entry._count._all]),
  );
  const currency = new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
  const topCategories = categoryCounts
    .filter((category) => category._count.items > 0)
    .sort((left, right) => right._count.items - left._count.items)
    .slice(0, 12);
  const topLocations = locationCounts
    .filter((location) => location._count.items > 0)
    .sort((left, right) => right._count.items - left._count.items)
    .slice(0, 12);

  const { document, writer } = await reportDocument("Inventory overview", "Inventory overview");
  writer.addBody("Inventory and requests.", 10, mutedColor);
  writer.addHeading("Inventory totals");
  writer.addMetricRow([
    { label: "Inventory records", value: inventorySummary._count._all.toLocaleString() },
    { label: "Quantity", value: (inventorySummary._sum.quantity ?? 0).toLocaleString() },
    { label: "PC / Mac records", value: pcCount.toLocaleString() },
  ]);
  writer.addMetricRow(
    canManage
      ? [
          { label: "Needs attention", value: attentionCount.toLocaleString() },
          { label: "PCs due for check", value: stalePcCount.toLocaleString() },
          {
            label: "Acquisition value",
            value: currency.format(Number(inventorySummary._sum.purchasePrice?.toString() ?? 0)),
          },
        ]
      : [
          { label: "Needs attention", value: attentionCount.toLocaleString() },
          { label: "PCs due for check", value: stalePcCount.toLocaleString() },
          {
            label: "Active locations",
            value: locationCounts
              .filter((location) => location._count.items > 0)
              .length.toLocaleString(),
          },
        ],
  );
  if (canManage) {
    writer.addHeading("Borrowing and maintenance");
    writer.addMetricRow([
      { label: "Open maintenance", value: openTicketCount.toLocaleString() },
      { label: "High / urgent", value: urgentTicketCount.toLocaleString() },
      { label: "Open QR issues", value: qrIssueCount.toLocaleString() },
    ]);
    writer.addMetricRow([
      { label: "Currently borrowed", value: activeBorrowCount.toLocaleString() },
      { label: "Overdue", value: overdueBorrowCount.toLocaleString() },
      { label: "Upcoming reservations", value: reservationCount.toLocaleString() },
    ]);
  }
  writer.addHeading("Equipment status");
  writer.addTable(
    ["Status", "Records"],
    Object.values(ItemStatus).map((status) => [
      inventoryStatusLabel(status),
      (statusMap.get(status) ?? 0).toLocaleString(),
    ]),
    { widths: [3, 1] },
  );
  writer.addHeading("Equipment condition");
  writer.addTable(
    ["Condition", "Records"],
    Object.values(ItemCondition).map((condition) => [
      humanize(condition),
      (conditionMap.get(condition) ?? 0).toLocaleString(),
    ]),
    { widths: [3, 1] },
  );
  writer.addHeading(
    attentionCount > attentionItems.length
      ? `Needs attention (first ${attentionItems.length})`
      : "Needs attention",
  );
  writer.addTable(
    ["Item", "Category / location", "Status / condition", "Last checked"],
    attentionItems.map((item) => [
      [item.name, item.assetTag ?? "No asset tag"].join("\n"),
      `${item.category.name}\n${item.location.name}`,
      `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}`,
      formatReportDateTime(item.lastCheckedAt),
    ]),
    { maxCellCharacters: 150, widths: [1.4, 1.3, 1.05, 1.15] },
  );
  writer.addHeading("Items by category");
  writer.addTable(
    ["Category", "Records"],
    topCategories.map((category) => [category.name, category._count.items.toLocaleString()]),
    { widths: [3, 1] },
  );
  writer.addHeading("Items by location");
  writer.addTable(
    ["Location", "Records"],
    topLocations.map((location) => [location.name, location._count.items.toLocaleString()]),
    { widths: [3, 1] },
  );
  if (canManage) {
    writer.addHeading(
      reservations.length > 20 ? "Upcoming reservations (first 20)" : "Upcoming reservations",
    );
    writer.addTable(
      ["Item", "Borrower", "Pickup", "Return by"],
      reservations
        .slice(0, 20)
        .map((request) => [
          request.inventoryItem.name,
          request.borrowerName,
          formatReportDateTime(request.startsAt),
          formatReportDateTime(request.expectedReturnDate),
        ]),
      { widths: [1.4, 1.2, 1.2, 1.2] },
    );
    writer.addHeading("Open maintenance requests");
    writer.addTable(
      ["Item", "Priority", "Opened"],
      openTickets.map((ticket) => [
        [
          ticket.inventoryItem.name,
          ticket.inventoryItem.assetTag ?? "No asset tag",
          ticket.title,
        ].join("\n"),
        humanize(ticket.priority),
        formatReportDateTime(ticket.openedAt),
      ]),
      { widths: [1.9, 0.85, 1.25] },
    );
    writer.addHeading("Overdue");
    writer.addTable(
      ["Item", "Borrower", "Return by", "Status"],
      overdueBorrows.map((request) => [
        [request.inventoryItem.name, request.inventoryItem.assetTag ?? "No asset tag"].join("\n"),
        request.borrowerName,
        formatReportDate(request.expectedReturnDate),
        borrowStatusLabel(request.status),
      ]),
      { widths: [1.6, 1.25, 1.1, 0.8] },
    );
  }
  writer.finish();
  return documentResponse(document, `ceit-inventory-overview-${calendarDate}.pdf`);
}
