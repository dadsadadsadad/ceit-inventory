import { formatManilaDate } from "@/lib/manila-date";
import { humanizeEnum } from "@/lib/labels";
import type { ExportDateRange } from "@/lib/report-export-filters";

export function formatReportDate(value: Date) {
  return formatManilaDate(value, { day: "numeric", month: "long", year: "numeric" });
}

export function formatReportDateTime(value: Date | null | undefined) {
  return value
    ? formatManilaDate(value, { dateStyle: "medium", timeStyle: "short" })
    : "Not recorded";
}

/** A calendar day such as "Oct 6, 2026", or "Not recorded". */
export function formatReportDay(value: Date | null | undefined) {
  return value
    ? formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" })
    : "Not recorded";
}

export const humanize = humanizeEnum;

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

/** "Dates: Aug 1, 2026 to Aug 15, 2026", or nothing when no dates are chosen. */
export function dateRangeChip(range: ExportDateRange, label = "Dates") {
  if (!range.from && !range.toExclusive) {
    return null;
  }
  const from = range.from ? formatReportDay(range.from) : "the beginning";
  const end = range.toExclusive ? new Date(range.toExclusive.getTime() - 1) : null;
  return `${label}: ${from}${end ? ` to ${formatReportDay(end)}` : " onward"}`;
}

/** Keep only the filters that are set, so an empty list means "no filters". */
export function chips(...entries: (string | null | undefined | false)[]) {
  return entries.filter((entry): entry is string => Boolean(entry));
}
