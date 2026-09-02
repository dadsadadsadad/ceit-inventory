import { AuditAction, Prisma } from "@prisma/client";

import { exportPeriods, parseReportExportFilters, type ExportPeriod } from "@/lib/report-export-filters";

export const auditActions = Object.values(AuditAction);

export type AuditTrailEvent = {
  action: AuditAction;
  actorId: string | null;
  actorName: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  entityType?: string | null;
  metadata: Prisma.JsonValue | null;
};

export type AuditTrailFilters = {
  action?: AuditAction;
  actor?: string;
  dateRange: ReturnType<typeof parseReportExportFilters>["dateRange"];
  from?: string;
  period: ExportPeriod;
  query?: string;
  to?: string;
};

type QueryParameters = Pick<URLSearchParams, "get">;

const maximumFilterTextLength = 120;
const recordChangeActions: AuditAction[] = [AuditAction.UPDATED, AuditAction.MOVED, AuditAction.STATUS_CHANGED];

function textFilter(parameters: QueryParameters, key: string, label: string) {
  const value = parameters.get(key)?.trim();
  if (!value) return undefined;
  if (value.length > maximumFilterTextLength) throw new Error(`${label} must be ${maximumFilterTextLength} characters or fewer.`);
  return value;
}

function optionalAction(value: string | null) {
  if (!value) return undefined;
  if (!auditActions.includes(value as AuditAction)) throw new Error("Invalid audit action.");
  return value as AuditAction;
}

export function parseAuditTrailFilters(parameters: QueryParameters, now = new Date()): AuditTrailFilters {
  const reportFilters = parseReportExportFilters(parameters, now);
  return {
    action: optionalAction(parameters.get("action")),
    actor: textFilter(parameters, "actor", "User filter"),
    dateRange: reportFilters.dateRange,
    from: parameters.get("from") || undefined,
    period: reportFilters.period,
    query: textFilter(parameters, "q", "Search"),
    to: parameters.get("to") || undefined,
  };
}

export function auditTrailWhere(filters: AuditTrailFilters): Prisma.InventoryAuditWhereInput {
  const conditions: Prisma.InventoryAuditWhereInput[] = [];
  if (filters.action) conditions.push({ action: filters.action });
  if (filters.actor) conditions.push({ actorName: { contains: filters.actor, mode: "insensitive" } });
  if (filters.dateRange.from || filters.dateRange.toExclusive) {
    conditions.push({
      createdAt: {
        ...(filters.dateRange.from ? { gte: filters.dateRange.from } : {}),
        ...(filters.dateRange.toExclusive ? { lt: filters.dateRange.toExclusive } : {}),
      },
    });
  }
  if (filters.query) {
    conditions.push({
      OR: [
        { summary: { contains: filters.query, mode: "insensitive" } },
        { actorName: { contains: filters.query, mode: "insensitive" } },
        { entityLabel: { contains: filters.query, mode: "insensitive" } },
        { item: { is: { name: { contains: filters.query, mode: "insensitive" } } } },
        { item: { is: { assetTag: { contains: filters.query, mode: "insensitive" } } } },
      ],
    });
  }

  return conditions.length ? { AND: conditions } : {};
}

export function auditTrailSearchParameters(filters: AuditTrailFilters, page?: number) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (filters.action) parameters.set("action", filters.action);
  if (filters.actor) parameters.set("actor", filters.actor);
  if (filters.period !== "all") parameters.set("period", filters.period);
  if (filters.from) parameters.set("from", filters.from);
  if (filters.to) parameters.set("to", filters.to);
  if (page && page > 1) parameters.set("page", String(page));
  return parameters;
}

export function auditActionLabel(action: AuditAction) {
  const labels: Record<AuditAction, string> = {
    [AuditAction.CREATED]: "Created",
    [AuditAction.UPDATED]: "Updated",
    [AuditAction.MOVED]: "Moved",
    [AuditAction.SCANNED]: "Scanned",
    [AuditAction.STATUS_CHANGED]: "Status changed",
    [AuditAction.DELETED]: "Deleted",
    [AuditAction.REQUESTED]: "Requested",
    [AuditAction.BORROWED]: "Borrowed",
    [AuditAction.RETURNED]: "Returned",
    [AuditAction.DECLINED]: "Declined",
    [AuditAction.SIGNED_IN]: "Signed in",
    [AuditAction.SIGNED_OUT]: "Signed out",
    [AuditAction.EXPORTED]: "Exported",
  };
  return labels[action];
}

export function auditActorLabel(event: Pick<AuditTrailEvent, "actorId" | "actorName">) {
  const savedName = event.actorName?.trim();
  if (savedName) return savedName;
  return event.actorId ? "Former user" : "System / public";
}

export function auditMetadata(event: Pick<AuditTrailEvent, "metadata">): Prisma.JsonObject {
  const metadata = event.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Prisma.JsonObject : {};
}

function metadataText(metadata: Prisma.JsonObject, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function hasMetadataValue(metadata: Prisma.JsonObject, key: string) {
  return metadata[key] !== undefined && metadata[key] !== null;
}

export function auditCategory(event: AuditTrailEvent) {
  const metadata = auditMetadata(event);
  const activityKind = metadataText(metadata, "activityKind");
  const source = metadataText(metadata, "source");

  if (event.entityType === "account" || activityKind === "account") return "Accounts";
  if (event.entityType === "dashboard-note" || activityKind === "dashboard-note") return "Dashboard notes";
  if (event.entityType === "category" || event.entityType === "location" || activityKind === "configuration") return "Configuration";
  if (event.entityType === "report-export" || activityKind === "report-export") return "Report export";
  if (event.entityType === "session" || activityKind === "session") return "Access";
  if (event.entityType === "borrow-request") return "Borrowing";
  if (event.entityType === "maintenance-ticket") return "Maintenance";

  if (activityKind === "qr-code-print" || activityKind === "label-print" || source === "qr-code" || source === "qr-label") return "QR code";
  if (event.action === AuditAction.SCANNED || activityKind === "scan" || source === "qr") return "QR code scan";
  if (source === "import" || activityKind === "record-import") return "Import";
  if (hasMetadataValue(metadata, "borrowRequestId")) return "Borrowing";
  if (hasMetadataValue(metadata, "maintenanceTicketId") || source === "maintenance") return "Maintenance";
  if (source === "photo-upload" || source === "photo-delete") return "Item media";
  if (activityKind === "record-edit") return "Record edit";
  if (activityKind === "record-create" || event.action === AuditAction.CREATED) return "Record added";
  if (recordChangeActions.includes(event.action)) return "Record edit";
  return "Other activity";
}

export function auditFieldLabel(key: string) {
  const labels: Record<string, string> = {
    assetTag: "Asset tag",
    categoryId: "Category",
    itemType: "Item type",
    locationId: "Location",
    purchaseDate: "Purchase date",
    purchasePrice: "Purchase price",
    serialNumber: "Serial number",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function displayValue(value: Prisma.JsonValue) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "Empty";
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export function auditChangedFields(event: AuditTrailEvent) {
  const changes = auditMetadata(event).changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  return Object.entries(changes as Prisma.JsonObject).map(([key, value]) => ({ label: auditFieldLabel(key), value: displayValue(value ?? null) }));
}

export function auditEventDetail(event: AuditTrailEvent) {
  const metadata = auditMetadata(event);
  const changedFields = auditChangedFields(event);
  if (changedFields.length) return `Captured ${changedFields.length} changed field${changedFields.length === 1 ? "" : "s"}.`;

  const bulkAction = metadataText(metadata, "bulkAction");
  if (bulkAction) return `Bulk ${auditFieldLabel(bulkAction).toLowerCase()} update.`;
  if (auditCategory(event) === "QR code scan") return metadataText(metadata, "scanType") === "public" ? "QR code opened from a public device." : "QR code opened by signed-in staff.";
  if (auditCategory(event) === "QR code") return "QR code printed for physical use.";
  return null;
}

export function auditMetadataPreview(event: AuditTrailEvent) {
  const metadata = auditMetadata(event);
  const text = JSON.stringify(metadata, null, 2);
  return text.length > 4_000 ? `${text.slice(0, 3_997)}…` : text;
}

export { exportPeriods };
