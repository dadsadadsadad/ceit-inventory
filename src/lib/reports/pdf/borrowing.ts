import { prisma } from "@/prisma";
import {
  reportDateFilter as dateWhere,
  type ReportExportFilters,
} from "@/lib/report-export-filters";
import { documentResponse, reportDocument, mutedColor } from "../pdf-writer";
import { BorrowStatus } from "@prisma/client";
import { borrowStatusLabel } from "@/lib/borrow-status";
import {
  borrowingReportDateWhere as borrowingDateWhere,
  borrowingReportStatusFilter,
} from "@/lib/report-export-filters";
import { formatReportDateTime, filterLabel, hasFilters } from "../format";
import { pdfRowLimit } from "../limits";

// Requests, reservations, and returns.
export async function createBorrowingsPdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const borrowingStatus = borrowingReportStatusFilter(filters);
  const requests = await prisma.borrowRequest.findMany({
    where: {
      ...borrowingDateWhere(filters, appliedDateFilter),
      ...(borrowingStatus ? { status: borrowingStatus } : {}),
    },
    include: { inventoryItem: { select: { assetTag: true, name: true } } },
    orderBy: { requestedAt: "desc" },
    take: pdfRowLimit + 1,
  });
  if (requests.length > pdfRowLimit) {
    return new Response(
      `This export exceeds ${pdfRowLimit.toLocaleString()} records. Narrow the data before exporting.`,
      { status: 413 },
    );
  }
  const today = new Date();
  const active = requests.filter(
    (request) =>
      request.status === BorrowStatus.BORROWED || request.status === BorrowStatus.RETURN_REQUESTED,
  );
  const returned = requests.filter((request) => request.status === BorrowStatus.RETURNED);
  const reportTitle =
    filters.borrowingState === "currently-borrowed"
      ? "Borrowed items"
      : filters.borrowingState === "returned"
        ? "Returned items"
        : "Borrowing";
  const filenameStem =
    filters.borrowingState === "currently-borrowed"
      ? "ceit-borrowed-items"
      : filters.borrowingState === "returned"
        ? "ceit-returned-items"
        : "ceit-borrowing-history";

  const { document, writer } = await reportDocument(reportTitle, "Borrowing and reservations");
  writer.addBody("Borrowing requests, reservations, and returns.", 10, mutedColor);
  writer.addBody(
    filterLabel(filters, { borrowingState: true, borrowingStatus: true }),
    8.5,
    mutedColor,
  );
  writer.addHeading("Summary");
  writer.addMetricRow([
    { label: "Requests", value: requests.length.toLocaleString() },
    {
      label: filters.borrowingState === "returned" ? "Returned" : "Currently borrowed",
      value: (filters.borrowingState === "returned"
        ? returned.length
        : active.length
      ).toLocaleString(),
    },
    {
      label: "Overdue",
      value: active.filter((request) => request.expectedReturnDate < today).length.toLocaleString(),
    },
  ]);
  writer.addHeading("Requests");
  writer.addTable(
    ["Item", "Borrower", "Dates", "Status / quantity", "Notes"],
    requests.map((request) => [
      [request.inventoryItem.name, request.inventoryItem.assetTag ?? "No asset tag"].join("\n"),
      [request.borrowerName, request.studentNumber, request.contact].filter(Boolean).join("\n"),
      [
        `Requested: ${formatReportDateTime(request.requestedAt)}`,
        `Pickup: ${formatReportDateTime(request.startsAt)}`,
        `Return by: ${formatReportDateTime(request.expectedReturnDate)}`,
        ...(request.processedAt && request.status !== BorrowStatus.DECLINED
          ? [`Checked out: ${formatReportDateTime(request.processedAt)}`]
          : []),
        request.returnedAt
          ? `Returned: ${formatReportDateTime(request.returnedAt)}`
          : request.returnRequestedAt
            ? `Return requested: ${formatReportDateTime(request.returnRequestedAt)}`
            : "Not returned",
      ].join("\n"),
      `${request.isReservation ? "Reservation" : "Borrow now"}\n${borrowStatusLabel(request.status)}\n${request.requestedQuantity} unit${request.requestedQuantity === 1 ? "" : "s"}`,
      [
        request.approvedAt &&
          `Approved: ${formatReportDateTime(request.approvedAt)}${request.approvedByName ? ` by ${request.approvedByName}` : ""}`,
        request.cancelledAt && `Cancelled: ${formatReportDateTime(request.cancelledAt)}`,
        request.purpose,
        request.staffNotes && `Staff: ${request.staffNotes}`,
        request.returnRequestNotes && `Return: ${request.returnRequestNotes}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ]),
    { fontSize: 8, maxCellCharacters: 420, widths: [1.1, 1.1, 1.55, 0.95, 1.35] },
  );
  writer.finish();
  return documentResponse(
    document,
    `${filenameStem}${hasFilters(filters, { borrowing: true }) ? "-filtered" : ""}-${calendarDate}.pdf`,
  );
}
