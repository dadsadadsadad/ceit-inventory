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

export function formatLastChecked(value: Date | null | undefined) {
  return value ? formatReportDateTime(value) : "Not checked";
}

export function formatReportDay(value: Date | null | undefined) {
  return value
    ? formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" })
    : "Not recorded";
}

export const humanize = humanizeEnum;

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

export function dateRangeChip(range: ExportDateRange, label = "Dates") {
  if (!range.from && !range.toExclusive) {
    return null;
  }
  const from = range.from ? formatReportDay(range.from) : "the beginning";
  const end = range.toExclusive ? new Date(range.toExclusive.getTime() - 1) : null;
  return `${label}: ${from}${end ? ` to ${formatReportDay(end)}` : " onward"}`;
}

export function chips(...entries: (string | null | undefined | false)[]) {
  return entries.filter((entry): entry is string => Boolean(entry));
}

const pesoFormat = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

const shortPesoFormat = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 0,
  style: "currency",
});

export function formatPeso(value: number | { toString(): string } | null | undefined) {
  return value === null || value === undefined ? "" : pesoFormat.format(Number(value.toString()));
}

export function formatPesoShort(value: number) {
  return shortPesoFormat.format(value);
}

// "2 yr 3 mo"
export function formatAge(from: Date | null | undefined, now: Date) {
  if (!from) {
    return "";
  }
  const months = Math.max(
    0,
    (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + (now.getUTCMonth() - from.getUTCMonth()),
  );
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) {
    return `${rest} mo`;
  }
  return rest ? `${years} yr ${rest} mo` : `${years} yr`;
}
