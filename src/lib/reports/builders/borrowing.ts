import { BorrowStatus, ItemType, type Prisma } from "@prisma/client";

import { borrowableInventoryStatuses } from "@/lib/borrow-availability";
import { borrowStatusLabel } from "@/lib/borrow-status";
import { dueTodayWhere } from "@/lib/loan-due";
import { borrowSearchWhere } from "@/lib/record-search";
import {
  borrowingReportDateWhere,
  borrowingReportStateLabel,
  borrowingReportStatusFilter,
  reportDateFilter,
} from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

import { chips, dateRangeChip, formatPeso, formatReportDateTime, plural } from "../format";
import type { ReportChartTone, ReportModel } from "../model";
import { countChart, monthChart } from "../charts";
import { loadCapped, monthlyCounts, namedItemCounts, type BuilderContext } from "./shared";

const dayMs = 24 * 60 * 60 * 1000;
const activeStatuses: BorrowStatus[] = [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED];

type Request = {
  expectedReturnDate: Date;
  returnedAt: Date | null;
  status: BorrowStatus;
};

// days late, until now if still out
function daysLate(request: Request, now: Date) {
  const end = request.returnedAt ?? (activeStatuses.includes(request.status) ? now : null);
  if (!end || end <= request.expectedReturnDate) {
    return 0;
  }
  return Math.max(1, Math.floor((end.getTime() - request.expectedReturnDate.getTime()) / dayMs));
}

// out on loan, waiting on staff, finished, or stopped
const borrowTones: Record<BorrowStatus, ReportChartTone> = {
  REQUESTED: "not_tested",
  RESERVED: "working",
  BORROWED: "deployed",
  RETURN_REQUESTED: "deployed",
  RETURNED: "ok",
  DECLINED: "retired",
  CANCELLED: "retired",
};

const dateLabels = {
  overdue: "Return due",
  "currently-borrowed": "Checked out",
  returned: "Returned",
  reserved: "Pickup",
  cancelled: "Cancelled",
} as const;

export async function buildBorrowingReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const range = reportDateFilter(filters.dateRange);
  const status = borrowingReportStatusFilter(filters);
  const conditions: Prisma.BorrowRequestWhereInput[] = [
    borrowingReportDateWhere(filters, range),
    ...(status ? [{ status }] : []),
    ...(filters.borrowingState === "overdue" ? [{ expectedReturnDate: { lt: now } }] : []),
    ...(filters.borrowingState === "due-today" ? [dueTodayWhere(now)] : []),
    ...borrowSearchWhere(filters.query),
  ];
  const where: Prisma.BorrowRequestWhereInput = { AND: conditions };
  // only the full report lists idle equipment, and only what students can actually borrow
  const showIdle = filters.borrowingState === "all" && !filters.borrowingStatus && !filters.query;
  const idleWhere: Prisma.InventoryItemWhereInput = {
    itemType: ItemType.ASSET,
    status: { in: [...borrowableInventoryStatuses] },
    category: { isActive: true },
    location: { isActive: true },
    borrowRequests: { none: range ? { requestedAt: range } : {} },
  };

  const [
    { rows: requests, total },
    active,
    overdue,
    returned,
    byStatus,
    byMonth,
    topItems,
    finished,
    idle,
    idleCount,
  ] = await Promise.all([
    loadCapped(context, {
      find: (take) =>
        prisma.borrowRequest.findMany({
          where,
          include: { inventoryItem: { select: { assetTag: true, name: true } } },
          orderBy:
            filters.borrowingState === "overdue"
              ? { expectedReturnDate: "asc" }
              : { requestedAt: "desc" },
          take,
        }),
      count: () => prisma.borrowRequest.count({ where }),
    }),
    prisma.borrowRequest.count({
      where: { AND: [where, { status: { in: activeStatuses } }] },
    }),
    prisma.borrowRequest.count({
      where: {
        AND: [where, { status: { in: activeStatuses } }, { expectedReturnDate: { lt: now } }],
      },
    }),
    prisma.borrowRequest.count({ where: { AND: [where, { status: BorrowStatus.RETURNED }] } }),
    prisma.borrowRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
    monthlyCounts(now, (requestedAt) =>
      prisma.borrowRequest.count({ where: { AND: [where, { requestedAt }] } }),
    ),
    prisma.borrowRequest
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
    // returned loans, for average length and on time rate
    prisma.borrowRequest.findMany({
      where: { AND: [where, { status: BorrowStatus.RETURNED, returnedAt: { not: null } }] },
      select: { expectedReturnDate: true, processedAt: true, returnedAt: true, startsAt: true },
      take: 10_000,
    }),
    // items nobody borrowed in this period
    showIdle
      ? prisma.inventoryItem.findMany({
          where: idleWhere,
          include: { category: true, location: true },
          orderBy: [{ purchasePrice: { sort: "desc", nulls: "last" } }, { name: "asc" }],
          take: 30,
        })
      : Promise.resolve([]),
    showIdle ? prisma.inventoryItem.count({ where: idleWhere }) : Promise.resolve(0),
  ]);
  const late = finished.filter(
    (loan) => loan.returnedAt && loan.returnedAt > loan.expectedReturnDate,
  ).length;
  const loanDays = finished.map(
    (loan) =>
      ((loan.returnedAt ?? loan.expectedReturnDate).getTime() -
        (loan.processedAt ?? loan.startsAt).getTime()) /
      dayMs,
  );
  const averageLoan = loanDays.length
    ? loanDays.reduce((sum, value) => sum + Math.max(0, value), 0) / loanDays.length
    : null;

  const stateDate =
    filters.borrowingState in dateLabels
      ? dateLabels[filters.borrowingState as keyof typeof dateLabels]
      : "Requested";

  return {
    kind: "borrowing",
    title:
      filters.borrowingState === "overdue"
        ? "Overdue loans"
        : filters.borrowingState === "currently-borrowed"
          ? "Borrowed items"
          : filters.borrowingState === "returned"
            ? "Returned items"
            : filters.borrowingState === "due-today"
              ? "Due back today"
              : "Borrowing",
    description: "Requests, reservations, loans, and returns.",
    filters: chips(
      filters.query && `Search: "${filters.query}"`,
      filters.borrowingState !== "all" &&
        `Showing: ${borrowingReportStateLabel(filters.borrowingState)}`,
      filters.borrowingStatus &&
        filters.borrowingState === "all" &&
        `Status: ${borrowStatusLabel(filters.borrowingStatus)}`,
      dateRangeChip(filters.dateRange, `${stateDate} date`),
    ),
    generatedAt: now,
    metrics: [
      { label: "Requests", value: total.toLocaleString() },
      { label: "Currently out", value: active.toLocaleString() },
      {
        label: "Overdue",
        value: overdue.toLocaleString(),
        tone: overdue ? "alert" : undefined,
      },
      { label: "Returned", value: returned.toLocaleString() },
      {
        label: "Returned on time",
        value: finished.length
          ? `${Math.round(((finished.length - late) / finished.length) * 100)}%`
          : "-",
        note: finished.length ? `${plural(late, "late return")}` : "no returns yet",
        tone: late ? "alert" : undefined,
      },
      {
        label: "Average loan",
        value: averageLoan === null ? "-" : `${averageLoan.toFixed(1)} days`,
        note: "from check-out to return",
      },
      ...(showIdle
        ? [
            {
              label: "Borrowable, never requested",
              value: idleCount.toLocaleString(),
              note: range ? "in this period" : "since records began",
            },
          ]
        : []),
    ],
    charts: [
      monthChart("Requests per month", byMonth, "requests"),
      countChart(
        "Requests by status",
        byStatus.map((entry): [string, number] => [
          borrowStatusLabel(entry.status),
          entry._count._all,
        ]),
        "requests",
      ),
      countChart("Most requested equipment", topItems, "requests", 7),
      {
        title: "Returns",
        kind: "bars",
        unit: "loans",
        data: [
          { label: "On time", value: finished.length - late, tone: "ok" },
          { label: "Late", value: late, tone: "defective" },
        ],
      },
    ],
    tables: [
      {
        heading: "Requests",
        columns: [
          { label: "Item", width: 1.1, primary: true },
          { label: "Borrower", width: 1.1, primary: true },
          { label: "Dates", width: 1.6 },
          { label: "Status", width: 0.95 },
          { label: "Notes", width: 1.3 },
        ],
        tones: requests.map((request) =>
          activeStatuses.includes(request.status) && daysLate(request, now)
            ? "defective"
            : borrowTones[request.status],
        ),
        rows: requests.map((request) => {
          const late = daysLate(request, now);
          return [
            `${request.inventoryItem.name}\n${request.inventoryItem.assetTag ?? "No asset tag"}`,
            [request.borrowerName, request.studentNumber, request.contact]
              .filter(Boolean)
              .join("\n"),
            [
              `Requested ${formatReportDateTime(request.requestedAt)}`,
              `Pickup ${formatReportDateTime(request.startsAt)}`,
              `Return by ${formatReportDateTime(request.expectedReturnDate)}`,
              request.processedAt && request.status !== BorrowStatus.DECLINED
                ? `Checked out ${formatReportDateTime(request.processedAt)}`
                : null,
              request.returnedAt
                ? `Returned ${formatReportDateTime(request.returnedAt)}${late ? ` (${plural(late, "day")} late)` : ""}`
                : request.returnRequestedAt
                  ? `Return requested ${formatReportDateTime(request.returnRequestedAt)}`
                  : late
                    ? `Overdue by ${plural(late, "day")}`
                    : null,
            ]
              .filter(Boolean)
              .join("\n"),
            `${borrowStatusLabel(request.status)}\n${request.isReservation ? "Reservation" : "Borrow now"}\n${plural(request.requestedQuantity, "unit")}`,
            [
              request.approvedAt &&
                `Approved ${formatReportDateTime(request.approvedAt)}${request.approvedByName ? ` by ${request.approvedByName}` : ""}`,
              request.cancelledAt && `Cancelled ${formatReportDateTime(request.cancelledAt)}`,
              request.purpose,
              request.staffNotes && `Staff: ${request.staffNotes}`,
              request.returnRequestNotes && `Return: ${request.returnRequestNotes}`,
            ]
              .filter(Boolean)
              .join("\n"),
          ];
        }),
        total,
        emptyText: "No requests found.",
      },
      ...(showIdle
        ? [
            {
              heading: range
                ? "Borrowable equipment not requested in this period"
                : "Borrowable equipment never requested",
              note: "Working equipment students can borrow, most valuable first.",
              columns: [
                { label: "Item", width: 2, primary: true },
                { label: "Room", width: 1.2 },
                { label: "Price", width: 1, align: "right" as const },
              ],
              rows: idle.map((item) => [
                [item.name, item.assetTag].filter(Boolean).join(" · "),
                `${item.location.name}\n${item.category.name}`,
                item.purchasePrice === null ? "No price" : formatPeso(item.purchasePrice),
              ]),
              total: idleCount,
              emptyText: "Everything has been borrowed at least once.",
            },
          ]
        : []),
    ],
    csv: [
      [
        "Item",
        "Asset tag",
        "Borrower",
        "Student number",
        "Contact",
        "Purpose",
        "Quantity",
        "Return by",
        "Status",
        "Requested",
        "Processed",
        "Returned",
        "Return requested",
        "Days late",
        "Staff notes",
        "Return notes",
        "Request type",
        "Pickup",
        "Approved",
        "Approved by",
        "Cancelled",
      ],
      ...requests.map((entry) => [
        entry.inventoryItem.name,
        entry.inventoryItem.assetTag,
        entry.borrowerName,
        entry.studentNumber,
        entry.contact,
        entry.purpose,
        entry.requestedQuantity,
        entry.expectedReturnDate,
        borrowStatusLabel(entry.status),
        entry.requestedAt,
        entry.processedAt,
        entry.returnedAt,
        entry.returnRequestedAt,
        daysLate(entry, now) || "",
        entry.staffNotes,
        entry.returnRequestNotes,
        entry.isReservation ? "Reservation" : "Borrow now",
        entry.startsAt,
        entry.approvedAt,
        entry.approvedByName,
        entry.cancelledAt,
      ]),
    ],
  };
}
