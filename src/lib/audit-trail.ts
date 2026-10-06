import { AuditAction, Prisma } from "@prisma/client";

import { stripControlCharacters } from "./clean-text";
import { personName } from "./person";
import { manilaDateText, manilaDayLabel } from "@/lib/manila-date";
import {
  exportPeriods,
  parseReportExportFilters,
  type ExportPeriod,
} from "@/lib/report-export-filters";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";

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

/**
 * What the audit trail shows by default and the quick views staff can switch to.
 * "Routine" is activity that happens constantly and rarely matters afterwards.
 */
export const auditViews = [
  "important",
  "inventory",
  "borrowing",
  "maintenance",
  "setup",
  "routine",
  "all",
] as const;
export type AuditView = (typeof auditViews)[number];

export function isAuditView(value: string | null | undefined): value is AuditView {
  return auditViews.includes(value as AuditView);
}

export function auditViewLabel(view: AuditView) {
  return {
    important: "Important",
    inventory: "Inventory",
    borrowing: "Borrowing",
    maintenance: "Maintenance",
    setup: "Accounts & setup",
    routine: "Routine",
    all: "Everything",
  }[view];
}

export function auditViewDescription(view: AuditView) {
  return {
    important: "Changes to records, borrowing, maintenance, accounts, and setup.",
    inventory: "Records added, edited, moved, imported, inspected, or removed.",
    borrowing: "Requests, reservations, check-outs, and returns.",
    maintenance: "Reported problems and repairs.",
    setup: "Accounts, rooms, categories, and the department note.",
    routine: "QR scans, label prints, report downloads, and sign-ins.",
    all: "Every recorded event.",
  }[view];
}

/** Without a chosen view, searching for one kind of action looks through everything. */
export function defaultAuditView(action?: AuditAction): AuditView {
  return action ? "all" : "important";
}

export type AuditTrailFilters = {
  action?: AuditAction;
  actor?: string;
  dateRange: ReturnType<typeof parseReportExportFilters>["dateRange"];
  from?: string;
  period: ExportPeriod;
  query?: string;
  to?: string;
  view: AuditView;
};

type QueryParameters = Pick<URLSearchParams, "get">;

const maximumFilterTextLength = 120;
const recordChangeActions: AuditAction[] = [
  AuditAction.UPDATED,
  AuditAction.MOVED,
  AuditAction.STATUS_CHANGED,
];

function textFilter(parameters: QueryParameters, key: string, label: string) {
  const raw = parameters.get(key);
  const value = raw === null ? undefined : stripControlCharacters(raw).trim();
  if (!value) {
    return undefined;
  }
  if (value.length > maximumFilterTextLength) {
    throw new Error(`${label} must be ${maximumFilterTextLength} characters or fewer.`);
  }
  return value;
}

function optionalAction(value: string | null) {
  if (!value) {
    return undefined;
  }
  if (!auditActions.includes(value as AuditAction)) {
    throw new Error("Invalid audit action.");
  }
  return value as AuditAction;
}

// Validate activity search, dates, and user filters.
export function parseAuditTrailFilters(
  parameters: QueryParameters,
  now = new Date(),
): AuditTrailFilters {
  const reportFilters = parseReportExportFilters(parameters, now);
  const action = optionalAction(parameters.get("action"));
  const requestedView = parameters.get("view");
  if (requestedView && !isAuditView(requestedView)) {
    throw new Error("Invalid audit view.");
  }
  return {
    action,
    view: isAuditView(requestedView) ? requestedView : defaultAuditView(action),
    actor: textFilter(parameters, "actor", "User filter"),
    dateRange: reportFilters.dateRange,
    from: parameters.get("from") || undefined,
    period: reportFilters.period,
    query: textFilter(parameters, "q", "Search"),
    to: parameters.get("to") || undefined,
  };
}

const routineActions: AuditAction[] = [
  AuditAction.SCANNED,
  AuditAction.SIGNED_IN,
  AuditAction.SIGNED_OUT,
  AuditAction.EXPORTED,
];
// Older single-label prints were recorded as ordinary updates with this summary.
const singleLabelPrintSummary = "QR label opened for printing.";
const nonInventoryEntities = [
  "borrow-request",
  "maintenance-ticket",
  "account",
  "category",
  "location",
  "custom-field",
  "calendar-event",
  "dashboard-note",
  "session",
  "report-export",
];

/** Only non-nullable columns are compared, so negating this never drops rows with blanks. */
export function routineAuditWhere(): Prisma.InventoryAuditWhereInput {
  return {
    OR: [{ action: { in: routineActions } }, { summary: singleLabelPrintSummary }],
  };
}

/** The part of the query that each quick view adds. */
export function auditViewWhere(view: AuditView): Prisma.InventoryAuditWhereInput {
  switch (view) {
    case "all":
      return {};
    case "routine":
      return routineAuditWhere();
    case "important":
      return { NOT: routineAuditWhere() };
    case "borrowing":
      return { entityType: "borrow-request" };
    case "maintenance":
      return { entityType: "maintenance-ticket" };
    case "setup":
      return {
        entityType: {
          in: [
            "account",
            "category",
            "location",
            "custom-field",
            "calendar-event",
            "dashboard-note",
          ],
        },
      };
    case "inventory":
      return {
        AND: [
          { NOT: routineAuditWhere() },
          { OR: [{ entityType: null }, { entityType: { notIn: nonInventoryEntities } }] },
        ],
      };
  }
}

// Turn activity filters into a database query.
export function auditTrailWhere(filters: AuditTrailFilters): Prisma.InventoryAuditWhereInput {
  const conditions: Prisma.InventoryAuditWhereInput[] = [];
  if (filters.view !== "all") {
    conditions.push(auditViewWhere(filters.view));
  }
  if (filters.action) {
    conditions.push({ action: filters.action });
  }
  if (filters.actor) {
    conditions.push({ actorName: { contains: filters.actor, mode: "insensitive" } });
  }
  if (filters.dateRange.from || filters.dateRange.toExclusive) {
    conditions.push({
      createdAt: {
        ...(filters.dateRange.from ? { gte: filters.dateRange.from } : {}),
        ...(filters.dateRange.toExclusive ? { lt: filters.dateRange.toExclusive } : {}),
      },
    });
  }
  conditions.push(
    ...everyTermMatches<Prisma.InventoryAuditWhereInput>(searchTerms(filters.query), (term) => [
      { summary: { contains: term, mode: "insensitive" } },
      { actorName: { contains: term, mode: "insensitive" } },
      { entityLabel: { contains: term, mode: "insensitive" } },
      { item: { is: { name: { contains: term, mode: "insensitive" } } } },
      { item: { is: { assetTag: { contains: term, mode: "insensitive" } } } },
    ]),
  );

  return conditions.length ? { AND: conditions } : {};
}

// Preserve activity filters in links and downloads.
export function auditTrailSearchParameters(filters: AuditTrailFilters, page?: number) {
  const parameters = new URLSearchParams();
  if (filters.view !== defaultAuditView(filters.action)) {
    parameters.set("view", filters.view);
  }
  if (filters.query) {
    parameters.set("q", filters.query);
  }
  if (filters.action) {
    parameters.set("action", filters.action);
  }
  if (filters.actor) {
    parameters.set("actor", filters.actor);
  }
  if (filters.period !== "all") {
    parameters.set("period", filters.period);
  }
  if (filters.from) {
    parameters.set("from", filters.from);
  }
  if (filters.to) {
    parameters.set("to", filters.to);
  }
  if (page && page > 1) {
    parameters.set("page", String(page));
  }
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

/** Newest-first events split into one group per Philippine calendar day. */
export function groupEventsByDay<T extends { createdAt: Date }>(events: T[], now = new Date()) {
  const groups: { events: T[]; key: string; label: string }[] = [];
  for (const event of events) {
    const key = manilaDateText(event.createdAt);
    const current = groups.at(-1);
    if (current?.key === key) {
      current.events.push(event);
    } else {
      groups.push({ key, label: manilaDayLabel(event.createdAt, now), events: [event] });
    }
  }
  return groups;
}

// Show the staff account or public source of an event.
export function auditActorLabel(event: Pick<AuditTrailEvent, "actorId" | "actorName">) {
  const savedName = personName(event.actorName);
  if (savedName) {
    return savedName;
  }
  return event.actorId ? "Former user" : "System / public";
}

export function auditMetadata(event: Pick<AuditTrailEvent, "metadata">): Prisma.JsonObject {
  const metadata = event.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Prisma.JsonObject)
    : {};
}

function metadataText(metadata: Prisma.JsonObject, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function hasMetadataValue(metadata: Prisma.JsonObject, key: string) {
  return metadata[key] !== undefined && metadata[key] !== null;
}

// Group events by the work they describe.
export function auditCategory(event: AuditTrailEvent) {
  const metadata = auditMetadata(event);
  const activityKind = metadataText(metadata, "activityKind");
  const source = metadataText(metadata, "source");

  if (event.entityType === "account" || activityKind === "account") {
    return "Accounts";
  }
  if (event.entityType === "dashboard-note" || activityKind === "dashboard-note") {
    return "Dashboard notes";
  }
  if (event.entityType === "calendar-event") {
    return "Calendar";
  }
  if (
    event.entityType === "category" ||
    event.entityType === "location" ||
    event.entityType === "custom-field" ||
    activityKind === "configuration"
  ) {
    return "Configuration";
  }
  if (event.entityType === "report-export" || activityKind === "report-export") {
    return "Report export";
  }
  if (event.entityType === "session" || activityKind === "session") {
    return "Access";
  }
  if (event.entityType === "borrow-request") {
    return "Borrowing";
  }
  if (event.entityType === "maintenance-ticket") {
    return "Maintenance";
  }

  if (
    activityKind === "qr-code-print" ||
    activityKind === "label-print" ||
    source === "qr-code" ||
    source === "qr-label"
  ) {
    return "QR code";
  }
  if (event.action === AuditAction.SCANNED || activityKind === "scan" || source === "qr") {
    return "QR code scan";
  }
  if (source === "import" || activityKind === "record-import") {
    return "Import";
  }
  if (hasMetadataValue(metadata, "borrowRequestId")) {
    return "Borrowing";
  }
  if (hasMetadataValue(metadata, "maintenanceTicketId") || source === "maintenance") {
    return "Maintenance";
  }
  if (source === "photo-upload" || source === "photo-delete") {
    return "Item media";
  }
  if (activityKind === "record-edit") {
    return "Record edit";
  }
  if (activityKind === "record-create" || event.action === AuditAction.CREATED) {
    return "Record added";
  }
  if (recordChangeActions.includes(event.action)) {
    return "Record edit";
  }
  return "Other activity";
}

export function auditFieldLabel(key: string) {
  const labels: Record<string, string> = {
    assetTag: "Asset tag",
    categoryId: "Category",
    customFields: "Custom fields",
    itemType: "Item type",
    lastCheckedAt: "Last checked",
    locationId: "Location",
    lowStockThreshold: "Low stock alert",
    purchaseDate: "Purchase date",
    purchasePrice: "Purchase price",
    serialNumber: "Serial number",
    warrantyEndsAt: "Warranty end date",
  };
  return (
    labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())
  );
}

function displayValue(value: Prisma.JsonValue) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) {
    return "Empty";
  }
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

// List the field values recorded by an update.
export function auditChangedFields(event: AuditTrailEvent) {
  const changes = auditMetadata(event).changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return [];
  }
  return Object.entries(changes as Prisma.JsonObject).map(([key, value]) => ({
    label: auditFieldLabel(key),
    value: displayValue(value ?? null),
  }));
}

// Explain an event using its stored metadata.
export function auditEventDetail(event: AuditTrailEvent) {
  const metadata = auditMetadata(event);
  // What changed is listed on its own, so there is nothing more to say about it.
  if (auditChangedFields(event).length) {
    return null;
  }

  const bulkAction = metadataText(metadata, "bulkAction");
  if (bulkAction) {
    return `Bulk ${auditFieldLabel(bulkAction).toLowerCase()} update.`;
  }
  if (auditCategory(event) === "QR code scan") {
    return metadataText(metadata, "scanType") === "public"
      ? "QR code opened from a public device."
      : "QR code opened by signed-in staff.";
  }
  if (auditCategory(event) === "QR code") {
    return "QR code printed for physical use.";
  }
  return null;
}

export { exportPeriods };
