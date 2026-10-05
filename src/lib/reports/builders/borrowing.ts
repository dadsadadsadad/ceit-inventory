import { BorrowStatus, type Prisma } from "@prisma/client";

import { borrowStatusLabel } from "@/lib/borrow-status";
import { borrowSearchWhere } from "@/lib/record-search";
import {
  borrowingReportDateWhere,
  borrowingReportStateLabel,
  borrowingReportStatusFilter,
  reportDateFilter,
} from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

import { chips, dateRangeChip, formatReportDateTime, plural } from "../format";
import type { ReportModel } from "../model";
import { loadCapped, type BuilderContext } from "./shared";

const dayMs = 24 * 60 * 60 * 1000;
const activeStatuses: BorrowStatus[] = [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED];

type Request = {
  expectedReturnDate: Date;
  returnedAt: Date | null;
  status: BorrowStatus;
};

/** Whole days past the return time: for loans still out, until now; for returned ones, until return. */
function daysLate(request: Request, now: Date) {
  const end = request.returnedAt ?? (activeStatuses.includes(request.status) ? now : null);
  if (!end || end <= request.expectedReturnDate) {
    return 0;
  }
  return Math.max(1, Math.floor((end.getTime() - request.expectedReturnDate.getTime()) / dayMs));
}

const dateLabels = {
  overdue: "Return due",
  "currently-borrowed": "Checked out",
  returned: "Returned",
  reserved: "Pickup",
  cancelled: "Cancelled",
} as const;

// Requests, reservations, loans, and returns.
export async function buildBorrowingReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const range = reportDateFilter(filters.dateRange);
  const status = borrowingReportStatusFilter(filters);
  const conditions: Prisma.BorrowRequestWhereInput[] = [
    borrowingReportDateWhere(filters, range),
    ...(status ? [{ status }] : []),
    ...(filters.borrowingState === "overdue" ? [{ expectedReturnDate: { lt: now } }] : []),
    ...borrowSearchWhere(filters.query),
  ];
  const where: Prisma.BorrowRequestWhereInput = { AND: conditions };

  const [{ rows: requests, total }, active, overdue, returned] = await Promise.all([
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
  ]);

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
            : "Borrowing",
    description: "Requests, reservations, loans, and returns.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
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
        emptyText: "No borrowing requests match these filters.",
      },
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
