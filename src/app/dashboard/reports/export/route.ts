import { MaintenanceStatus, Prisma } from "@prisma/client";

import { auditCategory, auditTrailWhere, parseAuditTrailFilters } from "@/lib/audit-trail";
import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { manilaCalendarDate } from "@/lib/manila-date";
import { borrowingReportStatusFilter, parseReportExportFilters, reportDateWhere } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

const maximumExportRecords = 10_000;

function csvValue(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll("\"", "\"\"")}"`;
}

function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
}

function download(content: string, filename: string) {
  return new Response(content, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function exportLimitReached(recordCount: number) {
  return recordCount > maximumExportRecords
    ? new Response(`This export exceeds ${maximumExportRecords.toLocaleString()} records. Narrow the data before exporting.`, { status: 413 })
    : null;
}

function dateFilter(range: ReturnType<typeof parseReportExportFilters>["dateRange"]) {
  const where = reportDateWhere(range);
  return Object.keys(where).length ? where : undefined;
}

function filename(stem: string, date: string, hasFilters: boolean) {
  return `${stem}${hasFilters ? "-filtered" : ""}-${date}.csv`;
}

function borrowingFilenameStem(state: ReturnType<typeof parseReportExportFilters>["borrowingState"]) {
  if (state === "currently-borrowed") return "ceit-borrowed-items";
  if (state === "returned") return "ceit-returned-items";
  return "ceit-borrowing-history";
}

function borrowingDateWhere(filters: ReturnType<typeof parseReportExportFilters>, range: ReturnType<typeof dateFilter>): Prisma.BorrowRequestWhereInput {
  if (!range) return {};
  if (filters.borrowingState === "currently-borrowed") return { processedAt: range };
  if (filters.borrowingState === "returned") return { returnedAt: range };
  return { requestedAt: range };
}

export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  const parameters = new URL(request.url).searchParams;
  const kind = parameters.get("kind");
  const date = manilaCalendarDate();
  let filters: ReturnType<typeof parseReportExportFilters>;

  try {
    filters = parseReportExportFilters(parameters);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid export filters.", { status: 400 });
  }

  const appliedDateFilter = dateFilter(filters.dateRange);
  const hasFilters = Boolean(appliedDateFilter || filters.inventoryStatus || filters.pcOnly || filters.borrowingStatus || filters.borrowingState !== "all");

  if (kind === "inventory") {
    const where: Prisma.InventoryItemWhereInput = {
      ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
      ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
      ...(filters.pcOnly ? { isComputer: true } : {}),
    };
    const items = await prisma.inventoryItem.findMany({ where, include: { category: true, location: true, computer: true }, orderBy: [{ name: "asc" }, { assetTag: "asc" }], take: maximumExportRecords + 1 });
    const limitResponse = exportLimitReached(items.length);
    if (limitResponse) return limitResponse;
    return download(csv([
      ["Asset tag", "QR code", "Item", "Category", "Location", "Type", "Quantity", "Status", "Condition", "Manufacturer", "Model", "Serial number", "Record created", "Purchase date", "Last checked", "PC operating system", "PC last checked"],
      ...items.map((item) => [item.assetTag, item.qrCode, item.name, item.category.name, item.location.name, item.itemType, item.quantity, item.status, item.condition, item.manufacturer, item.model, item.serialNumber, item.createdAt, item.purchaseDate, item.lastCheckedAt, item.computer?.operatingSystem, item.computer?.lastCheckedAt]),
    ]), filename("ceit-inventory", date, hasFilters));
  }

  if (!canManageInventory(user.role)) return new Response("Forbidden", { status: 403 });

  if (kind === "pcs") {
    const where: Prisma.InventoryItemWhereInput = {
      isComputer: true,
      ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
      ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
    };
    const items = await prisma.inventoryItem.findMany({
      where,
      include: { category: true, location: true, computer: { include: { software: { orderBy: { name: "asc" } } } }, },
      orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
      take: maximumExportRecords + 1,
    });
    const limitResponse = exportLimitReached(items.length);
    if (limitResponse) return limitResponse;
    return download(csv([
      ["Asset tag", "QR code", "PC / Mac name", "Category", "Room / location", "Status", "Condition", "Last checked", "Manufacturer", "Model", "Serial number", "Operating system", "OS version", "Processor", "Graphics", "Memory (GB)", "Storage (GB)", "Storage type", "MAC address", "IP address", "Hardware description", "Software description", "Installed software"],
      ...items.map((item) => [
        item.assetTag,
        item.qrCode,
        item.name,
        item.category.name,
        item.location.name,
        item.status,
        item.condition,
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
        item.computer?.software.map((software) => [software.name, software.version].filter(Boolean).join(" ")).join("; "),
      ]),
    ]), filename("ceit-pc-register", date, hasFilters));
  }

  if (kind === "borrowings") {
    const borrowingStatus = borrowingReportStatusFilter(filters);
    const where: Prisma.BorrowRequestWhereInput = {
      ...borrowingDateWhere(filters, appliedDateFilter),
      ...(borrowingStatus ? { status: borrowingStatus } : {}),
    };
    const requests = await prisma.borrowRequest.findMany({ where, include: { inventoryItem: { select: { assetTag: true, name: true } } }, orderBy: { requestedAt: "desc" }, take: maximumExportRecords + 1 });
    const limitResponse = exportLimitReached(requests.length);
    if (limitResponse) return limitResponse;
    return download(csv([
      ["Item", "Asset tag", "Borrower", "Student number", "Contact", "Purpose", "Quantity", "Expected return", "Status", "Requested at", "Checked out / staff processed at", "Returned at", "Return requested at", "Staff notes", "Return request notes"],
      ...requests.map((entry) => [entry.inventoryItem.name, entry.inventoryItem.assetTag, entry.borrowerName, entry.studentNumber, entry.contact, entry.purpose, entry.requestedQuantity, entry.expectedReturnDate, entry.status, entry.requestedAt, entry.processedAt, entry.returnedAt, entry.returnRequestedAt, entry.staffNotes, entry.returnRequestNotes]),
    ]), filename(borrowingFilenameStem(filters.borrowingState), date, hasFilters));
  }

  if (kind === "maintenance") {
    const where: Prisma.MaintenanceTicketWhereInput = appliedDateFilter ? { openedAt: appliedDateFilter } : {};
    const tickets = await prisma.maintenanceTicket.findMany({ where, include: { inventoryItem: { select: { assetTag: true, name: true } } }, orderBy: { openedAt: "desc" }, take: maximumExportRecords + 1 });
    const limitResponse = exportLimitReached(tickets.length);
    if (limitResponse) return limitResponse;
    return download(csv([
      ["Item", "Asset tag", "Title", "Priority", "Status", "Description", "Reported by", "Assigned to", "Reported at", "Resolved at", "Resolution notes"],
      ...tickets.map((ticket) => [ticket.inventoryItem.name, ticket.inventoryItem.assetTag, ticket.title, ticket.priority, ticket.status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved", ticket.description, ticket.reportedByName, ticket.assignedToName, ticket.openedAt, ticket.resolvedAt, ticket.resolutionNotes]),
    ]), filename("ceit-service-requests", date, hasFilters));
  }

  if (kind === "activity") {
    if (!canManageAdministration(user.role)) return new Response("Forbidden", { status: 403 });
    let auditFilters: ReturnType<typeof parseAuditTrailFilters>;
    try {
      auditFilters = parseAuditTrailFilters(parameters);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Invalid audit filters.", { status: 400 });
    }
    const where = auditTrailWhere(auditFilters);
    const hasAuditFilters = Boolean(auditFilters.dateRange.from || auditFilters.dateRange.toExclusive || auditFilters.action || auditFilters.actor || auditFilters.query);
    const activity = await prisma.inventoryAudit.findMany({
      where,
      include: { item: { select: { assetTag: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: maximumExportRecords + 1,
    });
    const limitResponse = exportLimitReached(activity.length);
    if (limitResponse) return limitResponse;
    return download(csv([
      ["Audit ID", "When", "Category", "Action", "Item", "Asset tag", "User", "Summary", "Metadata"],
      ...activity.map((event) => [event.id, event.createdAt, auditCategory(event), event.action, event.item.name, event.item.assetTag, event.actorName ?? (event.actorId ? "Former user" : "System / public"), event.summary, event.metadata ? JSON.stringify(event.metadata) : ""]),
    ]), filename("ceit-audit-trail", date, hasAuditFilters));
  }

  return new Response("Unknown export", { status: 400 });
}
