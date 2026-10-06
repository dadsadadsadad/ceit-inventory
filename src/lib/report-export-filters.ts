import {
  BorrowStatus,
  ItemCondition,
  ItemStatus,
  ItemType,
  MaintenancePriority,
  MaintenanceStatus,
  type Prisma,
} from "@prisma/client";

import {
  isHardwareComponent,
  isLicenseFilter,
  type HardwareComponent,
  type LicenseFilter,
} from "@/lib/computer-directory";
import { isUuid } from "@/lib/ids";
import { isWarrantyFilter, type WarrantyFilter } from "@/lib/warranty";
import { manilaCalendarDate } from "@/lib/manila-date";

export const exportPeriods = [
  "all",
  "today",
  "last-7-days",
  "last-30-days",
  "this-month",
  "this-year",
] as const;
export const borrowingReportStates = [
  "all",
  "currently-borrowed",
  "overdue",
  "due-today",
  "reserved",
  "returned",
  "requested",
  "declined",
  "cancelled",
] as const;

export type ExportPeriod = (typeof exportPeriods)[number];
export type BorrowingReportState = (typeof borrowingReportStates)[number];
export type ExportDateRange = { from?: Date; toExclusive?: Date };
export type ReportExportFilters = {
  /** Only items that need attention (defective, untested, poor condition, or awaiting repair). */
  attention: boolean;
  borrowingState: BorrowingReportState;
  borrowingStatus?: BorrowStatus;
  categoryId?: string;
  component?: HardwareComponent;
  condition?: ItemCondition;
  dateRange: ExportDateRange;
  /** Retired and lost PCs are left out of the hardware and software reports unless asked for. */
  includeRetired: boolean;
  /** Only PCs missing a processor, memory, or storage. */
  incomplete: boolean;
  inventoryStatus?: ItemStatus;
  itemType?: ItemType;
  license?: LicenseFilter;
  locationId?: string;
  maintenancePriority?: MaintenancePriority;
  maintenanceSource?: "QR" | "STAFF";
  maintenanceStatus?: MaintenanceStatus;
  pcOnly: boolean;
  period: ExportPeriod;
  query?: string;
  /** "low" for stock at or below its alert level (which includes none left), "out" for none left. */
  stock?: "low" | "out";
  warranty?: WarrantyFilter;
};

type QueryParameters = Pick<URLSearchParams, "get">;

function isExportPeriod(value: string): value is ExportPeriod {
  return exportPeriods.includes(value as ExportPeriod);
}

function isBorrowingReportState(value: string): value is BorrowingReportState {
  return borrowingReportStates.includes(value as BorrowingReportState);
}

function calendarDate(value: string | null, label: string) {
  if (!value) {
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid date.`);
  }
  return value;
}

function addDays(value: string, days: number) {
  const result = new Date(`${value}T12:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function startOfDate(value: string) {
  return new Date(`${value}T00:00:00+08:00`);
}

// Include the full end date without including the next day.
function dateRange(from?: string, to?: string): ExportDateRange {
  if (from && to && from > to) {
    throw new Error("Start date must be on or before end date.");
  }
  return {
    ...(from ? { from: startOfDate(from) } : {}),
    ...(to ? { toExclusive: startOfDate(addDays(to, 1)) } : {}),
  };
}

/** A date range from two YYYY-MM-DD values for list pages; anything invalid is ignored. */
export function lenientDateRange(from?: string, to?: string): ExportDateRange {
  try {
    return dateRange(
      calendarDate(from ?? null, "Start date"),
      calendarDate(to ?? null, "End date"),
    );
  } catch {
    return {};
  }
}

// Convert a timeframe preset into Manila date boundaries.
function periodRange(period: ExportPeriod, now: Date): ExportDateRange {
  if (period === "all") {
    return {};
  }
  const today = manilaCalendarDate(now);
  if (period === "today") {
    return dateRange(today, today);
  }
  if (period === "last-7-days") {
    return dateRange(addDays(today, -6), today);
  }
  if (period === "last-30-days") {
    return dateRange(addDays(today, -29), today);
  }
  if (period === "this-month") {
    return dateRange(`${today.slice(0, 8)}01`, today);
  }
  return dateRange(`${today.slice(0, 4)}-01-01`, today);
}

function optionalItemStatus(value: string | null) {
  if (!value) {
    return undefined;
  }
  if (!Object.values(ItemStatus).includes(value as ItemStatus)) {
    throw new Error("Invalid inventory status.");
  }
  return value as ItemStatus;
}

function optionalBorrowStatus(value: string | null) {
  if (!value) {
    return undefined;
  }
  if (!Object.values(BorrowStatus).includes(value as BorrowStatus)) {
    throw new Error("Invalid borrowing status.");
  }
  return value as BorrowStatus;
}

function optionalEnum<T extends string>(
  value: string | null,
  values: Record<string, T>,
  message: string,
) {
  if (!value) {
    return undefined;
  }
  if (!Object.values(values).includes(value as T)) {
    throw new Error(message);
  }
  return value as T;
}

function optionalId(value: string | null, message: string) {
  if (!value) {
    return undefined;
  }
  if (!isUuid(value)) {
    throw new Error(message);
  }
  return value;
}

function searchText(value: string | null) {
  const text = value?.replace(/\s+/g, " ").trim().slice(0, 120);
  return text || undefined;
}

function borrowingReportState(value: string | null) {
  if (!value) {
    return "all" as const;
  }
  if (!isBorrowingReportState(value)) {
    throw new Error("Invalid lending report view.");
  }
  return value;
}

// Validate the selected report filters and dates.
export function parseReportExportFilters(
  parameters: QueryParameters,
  now = new Date(),
): ReportExportFilters {
  const source = parameters.get("maintenanceSource");
  if (source && source !== "QR" && source !== "STAFF") {
    throw new Error("Invalid maintenance source.");
  }
  const requestedPeriod = parameters.get("period") ?? "all";
  if (!isExportPeriod(requestedPeriod)) {
    throw new Error("Invalid export period.");
  }

  const from = calendarDate(parameters.get("from"), "Start date");
  const to = calendarDate(parameters.get("to"), "End date");
  const hasCustomRange = Boolean(from || to);

  const license = parameters.get("license");
  if (license && !isLicenseFilter(license)) {
    throw new Error("Invalid license filter.");
  }
  const stock = parameters.get("stock");
  if (stock && stock !== "low" && stock !== "out") {
    throw new Error("Invalid stock filter.");
  }
  const warranty = parameters.get("warranty");
  if (warranty && !isWarrantyFilter(warranty)) {
    throw new Error("Invalid warranty filter.");
  }
  const component = parameters.get("component");
  if (component && !isHardwareComponent(component)) {
    throw new Error("Invalid hardware component.");
  }

  return {
    attention: parameters.get("attention") === "1",
    borrowingState: borrowingReportState(parameters.get("borrowingState")),
    borrowingStatus: optionalBorrowStatus(parameters.get("borrowingStatus")),
    categoryId: optionalId(parameters.get("category"), "Invalid category."),
    component: component ? (component as HardwareComponent) : undefined,
    condition: optionalEnum(parameters.get("condition"), ItemCondition, "Invalid condition."),
    dateRange: hasCustomRange ? dateRange(from, to) : periodRange(requestedPeriod, now),
    includeRetired: parameters.get("retired") === "1",
    incomplete: parameters.get("incomplete") === "1",
    inventoryStatus: optionalItemStatus(parameters.get("inventoryStatus")),
    itemType: optionalEnum(parameters.get("itemType"), ItemType, "Invalid item type."),
    license: license ? (license as LicenseFilter) : undefined,
    locationId: optionalId(parameters.get("location"), "Invalid location."),
    maintenancePriority: optionalEnum(
      parameters.get("maintenancePriority"),
      MaintenancePriority,
      "Invalid maintenance priority.",
    ),
    ...(source ? { maintenanceSource: source as "QR" | "STAFF" } : {}),
    maintenanceStatus: optionalEnum(
      parameters.get("maintenanceStatus"),
      MaintenanceStatus,
      "Invalid maintenance status.",
    ),
    pcOnly: parameters.get("pcOnly") === "1",
    period: requestedPeriod,
    query: searchText(parameters.get("q")),
    stock: stock ? (stock as "low" | "out") : undefined,
    warranty: warranty ? (warranty as WarrantyFilter) : undefined,
  };
}

// A return request still counts as borrowed until staff confirm it.
export function borrowingReportStatusFilter(
  filters: Pick<ReportExportFilters, "borrowingState" | "borrowingStatus">,
) {
  switch (filters.borrowingState) {
    case "currently-borrowed":
    case "overdue":
    case "due-today":
      return { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] };
    case "returned":
      return BorrowStatus.RETURNED;
    case "reserved":
      return BorrowStatus.RESERVED;
    case "cancelled":
      return BorrowStatus.CANCELLED;
    case "requested":
      return BorrowStatus.REQUESTED;
    case "declined":
      return BorrowStatus.DECLINED;
    case "all":
      return filters.borrowingStatus;
  }
}

export function borrowingReportStateLabel(state: BorrowingReportState) {
  switch (state) {
    case "currently-borrowed":
      return "Currently borrowed";
    case "overdue":
      return "Overdue";
    case "due-today":
      return "Due back today";
    case "returned":
      return "Returned items";
    case "reserved":
      return "Reserved";
    case "cancelled":
      return "Cancelled";
    case "requested":
      return "Pending review";
    case "declined":
      return "Declined";
    case "all":
      return "All requests";
  }
}

export function reportDateWhere(range: ExportDateRange) {
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.toExclusive ? { lt: range.toExclusive } : {}),
  };
}

// Leave the query unrestricted when no dates are selected.
export function reportDateFilter(range: ExportDateRange) {
  return range.from || range.toExclusive ? reportDateWhere(range) : undefined;
}

// CSV and PDF use the same date for each borrowing view.
export function borrowingReportDateWhere(
  filters: ReportExportFilters,
  range = reportDateFilter(filters.dateRange),
): Prisma.BorrowRequestWhereInput {
  if (!range) {
    return {};
  }
  switch (filters.borrowingState) {
    case "overdue":
    case "due-today":
      return { expectedReturnDate: range };
    case "currently-borrowed":
      return { processedAt: range };
    case "returned":
      return { returnedAt: range };
    case "reserved":
      return { startsAt: range };
    case "cancelled":
      return { cancelledAt: range };
    default:
      return { requestedAt: range };
  }
}
