import { formatManilaDate } from "@/lib/manila-date";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { borrowStatusLabel } from "@/lib/borrow-status";
import { borrowingReportStateLabel, type ReportExportFilters } from "@/lib/report-export-filters";

export function formatReportDate(value: Date) {
  return formatManilaDate(value, { day: "numeric", month: "long", year: "numeric" });
}

export function formatReportDateTime(value: Date | null | undefined) {
  return value
    ? formatManilaDate(value, { dateStyle: "medium", timeStyle: "short" })
    : "Not recorded";
}

export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

// Show only the selected filters.
export function filterLabel(
  filters: ReportExportFilters,
  options: {
    borrowingState?: boolean;
    borrowingStatus?: boolean;
    inventoryStatus?: boolean;
    pcOnly?: boolean;
  } = {},
) {
  const segments: string[] = [];
  if (filters.dateRange.from || filters.dateRange.toExclusive) {
    const from = filters.dateRange.from
      ? formatReportDate(filters.dateRange.from)
      : "the beginning";
    const end = filters.dateRange.toExclusive
      ? new Date(filters.dateRange.toExclusive.getTime() - 1)
      : null;
    segments.push(`Dates: ${from}${end ? ` to ${formatReportDate(end)}` : " onward"}`);
  } else {
    segments.push("All time");
  }
  if (options.inventoryStatus && filters.inventoryStatus) {
    segments.push(`Status: ${inventoryStatusLabel(filters.inventoryStatus)}`);
  }
  if (options.borrowingState && filters.borrowingState !== "all") {
    segments.push(`View: ${borrowingReportStateLabel(filters.borrowingState)}`);
  }
  if (options.borrowingStatus && filters.borrowingStatus) {
    segments.push(`Status: ${borrowStatusLabel(filters.borrowingStatus)}`);
  }
  if (options.pcOnly && filters.pcOnly) {
    segments.push("PC / Mac only");
  }
  return segments.join(" | ");
}

// Mark downloads whose records were filtered.
export function hasFilters(
  filters: ReportExportFilters,
  options: {
    borrowing?: boolean;
    inventory?: boolean;
    pcOnly?: boolean;
    maintenance?: boolean;
  } = {},
) {
  return Boolean(
    filters.dateRange.from ||
    filters.dateRange.toExclusive ||
    (options.inventory && filters.inventoryStatus) ||
    (options.borrowing && filters.borrowingState !== "all") ||
    (options.borrowing && filters.borrowingStatus) ||
    (options.pcOnly && filters.pcOnly) ||
    (options.maintenance && filters.maintenanceSource),
  );
}
