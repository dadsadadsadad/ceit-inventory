import { BorrowStatus, ItemStatus, type Prisma } from "@prisma/client";

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
  borrowingState: BorrowingReportState;
  borrowingStatus?: BorrowStatus;
  dateRange: ExportDateRange;
  inventoryStatus?: ItemStatus;
  maintenanceSource?: "QR" | "STAFF";
  pcOnly: boolean;
  period: ExportPeriod;
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

  return {
    borrowingState: borrowingReportState(parameters.get("borrowingState")),
    borrowingStatus: optionalBorrowStatus(parameters.get("borrowingStatus")),
    dateRange: hasCustomRange ? dateRange(from, to) : periodRange(requestedPeriod, now),
    inventoryStatus: optionalItemStatus(parameters.get("inventoryStatus")),
    ...(source ? { maintenanceSource: source as "QR" | "STAFF" } : {}),
    pcOnly: parameters.get("pcOnly") === "1",
    period: requestedPeriod,
  };
}

// A return request still counts as borrowed until staff confirm it.
export function borrowingReportStatusFilter(
  filters: Pick<ReportExportFilters, "borrowingState" | "borrowingStatus">,
) {
  switch (filters.borrowingState) {
    case "currently-borrowed":
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
