import { prisma } from "@/prisma";
import {
  reportDateFilter as dateWhere,
  type ReportExportFilters,
} from "@/lib/report-export-filters";
import { documentResponse, reportDocument, mutedColor } from "../pdf-writer";
import { MaintenancePriority, MaintenanceStatus } from "@prisma/client";
import { formatReportDateTime, humanize, filterLabel, hasFilters } from "../format";
import { pdfRowLimit } from "../limits";

// Issue reports and staff notes.
export async function createMaintenancePdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const tickets = await prisma.maintenanceTicket.findMany({
    where: {
      ...(appliedDateFilter ? { openedAt: appliedDateFilter } : {}),
      ...(filters.maintenanceSource ? { source: filters.maintenanceSource } : {}),
    },
    include: { inventoryItem: { select: { assetTag: true, name: true } } },
    orderBy: { openedAt: "desc" },
    take: pdfRowLimit + 1,
  });
  if (tickets.length > pdfRowLimit) {
    return new Response(
      `This export exceeds ${pdfRowLimit.toLocaleString()} records. Narrow the data before exporting.`,
      { status: 413 },
    );
  }
  const open = tickets.filter((ticket) => ticket.status === MaintenanceStatus.OPEN);

  const { document, writer } = await reportDocument(
    "Maintenance requests",
    "Issue reports and repairs",
  );
  writer.addBody("Reported issues and repairs.", 10, mutedColor);
  writer.addBody(
    filterLabel(filters) +
      (filters.maintenanceSource
        ? " · Source: " + (filters.maintenanceSource === "QR" ? "QR issue reports" : "Staff")
        : ""),
    8.5,
    mutedColor,
  );
  writer.addHeading("Summary");
  writer.addMetricRow([
    { label: "Requests", value: tickets.length.toLocaleString() },
    { label: "Needs attention", value: open.length.toLocaleString() },
    {
      label: "High / urgent",
      value: open
        .filter(
          (ticket) =>
            ticket.priority === MaintenancePriority.HIGH ||
            ticket.priority === MaintenancePriority.URGENT,
        )
        .length.toLocaleString(),
    },
  ]);
  writer.addHeading("Requests");
  writer.addTable(
    ["Item / issue", "Priority / status", "Reported by", "Dates", "Notes"],
    tickets.map((ticket) => [
      [
        ticket.inventoryItem.name,
        ticket.inventoryItem.assetTag ?? "No asset tag",
        ticket.title,
      ].join("\n"),
      `${humanize(ticket.priority)}\n${ticket.status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved"}`,
      ticket.source === "QR" ? "QR issue report" : (ticket.reportedByName ?? "Staff"),
      [
        `Reported: ${formatReportDateTime(ticket.openedAt)}`,
        ticket.resolvedAt ? `Resolved: ${formatReportDateTime(ticket.resolvedAt)}` : "Not resolved",
      ].join("\n"),
      [ticket.description, ticket.resolutionNotes && `Staff: ${ticket.resolutionNotes}`]
        .filter(Boolean)
        .join("\n"),
    ]),
    { fontSize: 8, maxCellCharacters: 190, widths: [1.18, 0.9, 1.03, 1.13, 1.49] },
  );
  writer.finish();
  return documentResponse(
    document,
    `ceit-maintenance-requests${hasFilters(filters, { maintenance: true }) ? "-filtered" : ""}-${calendarDate}.pdf`,
  );
}
