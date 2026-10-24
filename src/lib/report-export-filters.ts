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
import { stripControlCharacters } from "@/lib/clean-text";
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

// days
export const reportWindows = [30, 60, 90, 180, 365] as const;
export type ReportWindow = (typeof reportWindows)[number];

export const missingDetails = [
  "price",
  "purchaseDate",
  "serial",
  "warranty",
  "photo",
  "inspection",
  "pcDetails",
] as const;
export type MissingDetail = (typeof missingDetails)[number];

// same max as the item form
export const maxReportPrice = 99_999_999.99;

export type ExportPeriod = (typeof exportPeriods)[number];
export type BorrowingReportState = (typeof borrowingReportStates)[number];
export type ExportDateRange = { from?: Date; toExclusive?: Date };
export type ReportExportFilters = {
  attention: boolean;
  borrowingState: BorrowingReportState;
  borrowingStatus?: BorrowStatus;
  categoryId?: string;
  component?: HardwareComponent;
  condition?: ItemCondition;
  dateRange: ExportDateRange;
  includeRetired: boolean;
  incomplete: boolean;
  inventoryStatus?: ItemStatus;
  itemType?: ItemType;
  license?: LicenseFilter;
  locationId?: string;
  maintenancePriority?: MaintenancePriority;
  maintenanceSource?: "QR" | "STAFF";
  maintenanceStatus?: MaintenanceStatus;
  missing?: MissingDetail;
  // pcs past their expected life
  oldPcs?: boolean;
  pcOnly: boolean;
  period: ExportPeriod;
  // inclusive
  priceMax?: number;
  priceMin?: number;
  // purchase date, not when the record was added
  purchased: ExportDateRange;
  query?: string;
  // low includes out
  stock?: "low" | "out";
  warranty?: WarrantyFilter;
  within?: ReportWindow;
};

type QueryParams = Pick<URLSearchParams, "get">;

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

// end date is inclusive
function dateRange(from?: string, to?: string): ExportDateRange {
  if (from && to && from > to) {
    throw new Error("Start date has to be before end date.");
  }
  return {
    ...(from ? { from: startOfDate(from) } : {}),
    ...(to ? { toExclusive: startOfDate(addDays(to, 1)) } : {}),
  };
}

// invalid dates are ignored
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
  const text = value && stripControlCharacters(value).replace(/\s+/g, " ").trim().slice(0, 120);
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

function optionalPrice(value: string | null, label: string) {
  const text = value?.replace(/[₱,\s]/g, "");
  if (!text) {
    return undefined;
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > maxReportPrice) {
    throw new Error(`${label} must be a peso amount from 0 to 99,999,999.99.`);
  }
  return Math.round(amount * 100) / 100;
}

// reads and validates every report filter from the query string
export function parseReportExportFilters(
  parameters: QueryParams,
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
  const priceMin = optionalPrice(parameters.get("priceMin"), "Lowest price");
  const priceMax = optionalPrice(parameters.get("priceMax"), "Highest price");
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    throw new Error("Min price can't be more than max price.");
  }
  const within = parameters.get("within");
  if (within && !reportWindows.includes(Number(within) as ReportWindow)) {
    throw new Error("Invalid time window.");
  }
  const missing = parameters.get("missing");
  if (missing && !missingDetails.includes(missing as MissingDetail)) {
    throw new Error("Invalid missing detail.");
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
    missing: missing ? (missing as MissingDetail) : undefined,
    ...(parameters.get("oldPcs") === "1" ? { oldPcs: true } : {}),
    pcOnly: parameters.get("pcOnly") === "1",
    period: requestedPeriod,
    priceMax,
    priceMin,
    purchased: dateRange(
      calendarDate(parameters.get("purchasedFrom"), "Purchased from"),
      calendarDate(parameters.get("purchasedTo"), "Purchased to"),
    ),
    query: searchText(parameters.get("q")),
    stock: stock ? (stock as "low" | "out") : undefined,
    warranty: warranty ? (warranty as WarrantyFilter) : undefined,
    within: within ? (Number(within) as ReportWindow) : undefined,
  };
}

// return requests still count as borrowed
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

export function reportDateFilter(range: ExportDateRange) {
  return range.from || range.toExclusive ? reportDateWhere(range) : undefined;
}

// which date each borrowing view filters on
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
