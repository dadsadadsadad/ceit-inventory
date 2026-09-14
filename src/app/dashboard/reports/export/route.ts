import { createCsv } from "@/lib/reports/csv";
import { MaintenanceStatus, Prisma } from "@prisma/client";

import { recordExport } from "@/lib/reports/export-log";
import { auditCategory, auditTrailWhere, parseAuditTrailFilters } from "@/lib/audit-trail";
import {
  canManageAdministration,
  canManageInventory,
  requireInventoryAccess,
} from "@/lib/inventory-auth";
import { manilaCalendarDate } from "@/lib/manila-date";
import {
  borrowingReportDateWhere as borrowingDateWhere,
  borrowingReportStatusFilter,
  parseReportExportFilters,
  reportDateFilter as dateFilter,
} from "@/lib/report-export-filters";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { borrowStatusLabel } from "@/lib/borrow-status";

import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

const csvRowLimit = 10_000;

async function download(
  content: string,
  filename: string,
  user: Awaited<ReturnType<typeof requireInventoryAccess>>,
  kind: string,
) {
  await recordExport(user, kind, "CSV");
  return new Response("\uFEFF" + content, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function exportLimitReached(recordCount: number) {
  return recordCount > csvRowLimit
    ? new Response(
        `This export exceeds ${csvRowLimit.toLocaleString()} records. Narrow the data before exporting.`,
        { status: 413 },
      )
    : null;
}

function filename(stem: string, date: string, hasFilters: boolean) {
  return `${stem}${hasFilters ? "-filtered" : ""}-${date}.csv`;
}

function borrowingFilenameStem(
  state: ReturnType<typeof parseReportExportFilters>["borrowingState"],
) {
  if (state === "currently-borrowed") {
    return "ceit-borrowed-items";
  }
  if (state === "returned") {
    return "ceit-returned-items";
  }
  return "ceit-borrowing-history";
}

// Check access and build the selected CSV report.
export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  const parameters = new URL(request.url).searchParams;
  const kind = parameters.get("kind");
  const date = manilaCalendarDate();
  let filters: ReturnType<typeof parseReportExportFilters>;

  try {
    filters = parseReportExportFilters(parameters);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid export filters.", {
      status: 400,
    });
  }

  const appliedDateFilter = dateFilter(filters.dateRange);

  if (kind === "inventory") {
    const where: Prisma.InventoryItemWhereInput = {
      ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
      ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
      ...(filters.pcOnly ? { isComputer: true } : {}),
    };
    const items = await prisma.inventoryItem.findMany({
      where,
      include: { category: true, location: true, computer: true },
      orderBy: [{ name: "asc" }, { assetTag: "asc" }],
      take: csvRowLimit + 1,
    });
    const limitResponse = exportLimitReached(items.length);
    if (limitResponse) {
      return limitResponse;
    }
    return download(
      createCsv([
        [
          "Asset tag",
          "QR code",
          "Item",
          "Category",
          "Location",
          "Type",
          "Quantity",
          "Status",
          "Condition",
          "Manufacturer",
          "Model",
          "Serial number",
          "Created",
          "Purchase date",
          "Last checked",
          "PC operating system",
          "PC last checked",
        ],
        ...items.map((item) => [
          item.assetTag,
          item.qrCode,
          item.name,
          item.category.name,
          item.location.name,
          inventoryStatusLabel(item.itemType),
          item.quantity,
          inventoryStatusLabel(item.status),
          inventoryStatusLabel(item.condition),
          item.manufacturer,
          item.model,
          item.serialNumber,
          item.createdAt,
          item.purchaseDate,
          item.lastCheckedAt,
          item.computer?.operatingSystem,
          item.computer?.lastCheckedAt,
        ]),
      ]),
      filename(
        "ceit-inventory",
        date,
        Boolean(appliedDateFilter || filters.inventoryStatus || filters.pcOnly),
      ),
      user,
      kind,
    );
  }

  if (!canManageInventory(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (kind === "pcs") {
    const where: Prisma.InventoryItemWhereInput = {
      isComputer: true,
      ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
      ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
    };
    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        category: true,
        location: true,
        computer: { include: { software: { orderBy: { name: "asc" } } } },
      },
      orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
      take: csvRowLimit + 1,
    });
    const limitResponse = exportLimitReached(items.length);
    if (limitResponse) {
      return limitResponse;
    }
    return download(
      createCsv([
        [
          "Asset tag",
          "QR code",
          "PC / Mac name",
          "Category",
          "Location",
          "Status",
          "Condition",
          "Last checked",
          "Manufacturer",
          "Model",
          "Serial number",
          "Operating system",
          "OS version",
          "Processor",
          "Graphics",
          "Memory (GB)",
          "Storage (GB)",
          "Storage type",
          "MAC address",
          "IP address",
          "Hardware description",
          "Software description",
          "Installed software",
        ],
        ...items.map((item) => [
          item.assetTag,
          item.qrCode,
          item.name,
          item.category.name,
          item.location.name,
          inventoryStatusLabel(item.status),
          inventoryStatusLabel(item.condition),
          item.lastCheckedAt,
          item.manufacturer,
          item.model,
          item.serialNumber,
          item.computer?.operatingSystem,
          item.computer?.osVersion,
          item.computer?.processor,
          item.computer?.graphics,
          item.computer?.memoryGb,
          item.computer?.storageGb,
          item.computer?.storageType,
          item.computer?.macAddress,
          item.computer?.ipAddress,
          item.computer?.hardwareDescription,
          item.computer?.softwareDescription,
          item.computer?.software
            .map((software) => [software.name, software.version].filter(Boolean).join(" "))
            .join("; "),
        ]),
      ]),
      filename("ceit-pc-register", date, Boolean(appliedDateFilter || filters.inventoryStatus)),
      user,
      kind,
    );
  }

  if (kind === "borrowings") {
    const borrowingStatus = borrowingReportStatusFilter(filters);
    const where: Prisma.BorrowRequestWhereInput = {
      ...borrowingDateWhere(filters, appliedDateFilter),
      ...(borrowingStatus ? { status: borrowingStatus } : {}),
    };
    const requests = await prisma.borrowRequest.findMany({
      where,
      include: { inventoryItem: { select: { assetTag: true, name: true } } },
      orderBy: { requestedAt: "desc" },
      take: csvRowLimit + 1,
    });
    const limitResponse = exportLimitReached(requests.length);
    if (limitResponse) {
      return limitResponse;
    }
    return download(
      createCsv([
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
          entry.staffNotes,
          entry.returnRequestNotes,
          entry.isReservation ? "Reservation" : "Borrow now",
          entry.startsAt,
          entry.approvedAt,
          entry.approvedByName,
          entry.cancelledAt,
        ]),
      ]),
      filename(
        borrowingFilenameStem(filters.borrowingState),
        date,
        Boolean(appliedDateFilter || filters.borrowingStatus || filters.borrowingState !== "all"),
      ),
      user,
      kind,
    );
  }

  if (kind === "maintenance") {
    const where: Prisma.MaintenanceTicketWhereInput = {
      ...(appliedDateFilter ? { openedAt: appliedDateFilter } : {}),
      ...(filters.maintenanceSource ? { source: filters.maintenanceSource } : {}),
    };
    const tickets = await prisma.maintenanceTicket.findMany({
      where,
      include: { inventoryItem: { select: { assetTag: true, name: true } } },
      orderBy: { openedAt: "desc" },
      take: csvRowLimit + 1,
    });
    const limitResponse = exportLimitReached(tickets.length);
    if (limitResponse) {
      return limitResponse;
    }
    return download(
      createCsv([
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
          inventoryStatusLabel(ticket.priority),
          ticket.status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved",
          ticket.description,
          ticket.reportedByName,
          ticket.openedAt,
          ticket.resolvedAt,
          ticket.resolutionNotes,
          ticket.source === "QR" ? "QR issue report" : "Staff",
        ]),
      ]),
      filename(
        "ceit-maintenance-requests",
        date,
        Boolean(appliedDateFilter || filters.maintenanceSource),
      ),
      user,
      kind,
    );
  }

  if (kind === "activity") {
    if (!canManageAdministration(user.role)) {
      return new Response("Forbidden", { status: 403 });
    }
    let auditFilters: ReturnType<typeof parseAuditTrailFilters>;
    try {
      auditFilters = parseAuditTrailFilters(parameters);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Invalid audit filters.", {
        status: 400,
      });
    }
    const where = auditTrailWhere(auditFilters);
    const hasAuditFilters = Boolean(
      auditFilters.dateRange.from ||
      auditFilters.dateRange.toExclusive ||
      auditFilters.action ||
      auditFilters.actor ||
      auditFilters.query,
    );
    const activity = await prisma.inventoryAudit.findMany({
      where,
      include: { item: { select: { assetTag: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: csvRowLimit + 1,
    });
    const limitResponse = exportLimitReached(activity.length);
    if (limitResponse) {
      return limitResponse;
    }
    return download(
      createCsv([
        [
          "Audit ID",
          "When",
          "Category",
          "Action",
          "Subject",
          "Reference",
          "User",
          "Summary",
          "Metadata",
        ],
        ...activity.map((event) => [
          event.id,
          event.createdAt,
          auditCategory(event),
          event.action,
          event.item?.name ?? event.entityLabel ?? "System",
          event.item?.assetTag ?? event.entityId ?? "",
          event.actorName ?? (event.actorId ? "Former user" : "System / public"),
          event.summary,
          event.metadata ? JSON.stringify(event.metadata) : "",
        ]),
      ]),
      filename("ceit-audit-trail", date, hasAuditFilters),
      user,
      kind,
    );
  }

  return new Response("Unknown export", { status: 400 });
}
