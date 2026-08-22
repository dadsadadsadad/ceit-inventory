import { MaintenanceStatus } from "@prisma/client";

import { canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
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
  return new Response(content, { headers: { "Content-Disposition": `attachment; filename=\"${filename}\"`, "Content-Type": "text/csv; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
}

function exportLimitReached(recordCount: number) {
  return recordCount > maximumExportRecords
    ? new Response(`This export exceeds ${maximumExportRecords.toLocaleString()} records. Narrow the data before exporting.`, { status: 413 })
    : null;
}

export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  const kind = new URL(request.url).searchParams.get("kind");
  const date = new Date().toISOString().slice(0, 10);

  if (kind === "inventory") {
    const items = await prisma.inventoryItem.findMany({ include: { category: true, location: true, computer: true }, orderBy: [{ name: "asc" }, { assetTag: "asc" }], take: maximumExportRecords + 1 });
    const limitResponse = exportLimitReached(items.length);
    if (limitResponse) return limitResponse;
    return download(csv([["Asset tag", "Item", "Category", "Location", "Type", "Quantity", "Status", "Condition", "Manufacturer", "Model", "Serial number", "Purchase date", "PC operating system", "PC last checked"], ...items.map((item) => [item.assetTag, item.name, item.category.name, item.location.name, item.itemType, item.quantity, item.status, item.condition, item.manufacturer, item.model, item.serialNumber, item.purchaseDate, item.computer?.operatingSystem, item.computer?.lastCheckedAt])]), `ceit-inventory-${date}.csv`);
  }

  if (!canManageInventory(user.role)) return new Response("Forbidden", { status: 403 });

  if (kind === "borrowings") {
    const requests = await prisma.borrowRequest.findMany({ include: { inventoryItem: { select: { assetTag: true, name: true } } }, orderBy: { requestedAt: "desc" }, take: maximumExportRecords + 1 });
    const limitResponse = exportLimitReached(requests.length);
    if (limitResponse) return limitResponse;
    return download(csv([["Item", "Asset tag", "Borrower", "Student number", "Contact", "Purpose", "Quantity", "Expected return", "Status", "Requested at", "Processed at", "Returned at", "Return requested at", "Staff notes", "Return request notes"], ...requests.map((entry) => [entry.inventoryItem.name, entry.inventoryItem.assetTag, entry.borrowerName, entry.studentNumber, entry.contact, entry.purpose, entry.requestedQuantity, entry.expectedReturnDate, entry.status, entry.requestedAt, entry.processedAt, entry.returnedAt, entry.returnRequestedAt, entry.staffNotes, entry.returnRequestNotes])]), `ceit-borrowing-history-${date}.csv`);
  }

  if (kind === "maintenance") {
    const tickets = await prisma.maintenanceTicket.findMany({ include: { inventoryItem: { select: { assetTag: true, name: true } } }, orderBy: { openedAt: "desc" }, take: maximumExportRecords + 1 });
    const limitResponse = exportLimitReached(tickets.length);
    if (limitResponse) return limitResponse;
    return download(csv([["Item", "Asset tag", "Title", "Priority", "Status", "Description", "Reported by", "Assigned to", "Reported at", "Resolved at", "Resolution notes"], ...tickets.map((ticket) => [ticket.inventoryItem.name, ticket.inventoryItem.assetTag, ticket.title, ticket.priority, ticket.status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved", ticket.description, ticket.reportedByName, ticket.assignedToName, ticket.openedAt, ticket.resolvedAt, ticket.resolutionNotes])]), `ceit-service-requests-${date}.csv`);
  }

  return new Response("Unknown export", { status: 400 });
}
