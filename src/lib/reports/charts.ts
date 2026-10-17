import { ItemStatus } from "@prisma/client";

import { inventoryStatusLabel } from "@/lib/inventory-status";
import { manilaDateText } from "@/lib/manila-date";

import { formatPesoShort } from "./format";
import type { ReportChart, ReportChartTone } from "./model";

export const statusTones: Record<ItemStatus, ReportChartTone> = {
  OK: "ok",
  WORKING: "working",
  DEPLOYED: "deployed",
  DEFECTIVE: "defective",
  NOT_TESTED: "not_tested",
  RETIRED: "retired",
  LOST: "lost",
};

export function statusChart(
  counts: Map<ItemStatus, number>,
  title = "Records by status",
  unit = "records",
): ReportChart {
  return {
    title,
    kind: "bars",
    unit,
    data: Object.values(ItemStatus)
      .filter((status) => (counts.get(status) ?? 0) > 0)
      .map((status) => ({
        label: inventoryStatusLabel(status),
        value: counts.get(status) ?? 0,
        tone: statusTones[status],
      })),
  };
}

// every entry, largest first, nothing grouped away
export function countChart(title: string, entries: [string, number][], unit: string): ReportChart {
  const sorted = entries
    .filter(([, value]) => value > 0)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
  return {
    title,
    kind: "bars",
    unit,
    data: sorted.map(([label, value]) => ({ label, value })),
  };
}

// oldest first
export function recentMonths(now: Date, months = 6) {
  const [year, month] = manilaDateText(now).slice(0, 7).split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
  return Array.from({ length: months }, (_, index) => {
    const first = new Date(Date.UTC(year, month - 1 - (months - 1 - index), 1));
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    const key = (date: Date) => date.toISOString().slice(0, 7);
    return {
      label: label.format(first),
      start: new Date(`${key(first)}-01T00:00:00+08:00`),
      end: new Date(`${key(next)}-01T00:00:00+08:00`),
    };
  });
}

// starting this month
export function upcomingMonths(now: Date, months = 12) {
  const [year, month] = manilaDateText(now).slice(0, 7).split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
  return Array.from({ length: months }, (_, index) => {
    const first = new Date(Date.UTC(year, month - 1 + index, 1));
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    const key = (date: Date) => date.toISOString().slice(0, 7);
    return {
      label: label.format(first),
      year: first.getUTCFullYear(),
      start: new Date(`${key(first)}-01T00:00:00+08:00`),
      end: new Date(`${key(next)}-01T00:00:00+08:00`),
    };
  });
}

export function monthSpan(months: { label: string; year: number }[]) {
  const first = months[0];
  const last = months.at(-1);
  return first && last ? `${first.label} ${first.year} to ${last.label} ${last.year}` : "";
}

const compactPeso = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

export function monthChart(
  title: string,
  entries: [string, number][],
  unit: string,
  note = `The last ${entries.length} months.`,
): ReportChart {
  return {
    title,
    kind: "columns",
    unit,
    note,
    data: entries.map(([label, value]) => ({ label, value })),
  };
}

export function chartValue(chart: Pick<ReportChart, "format" | "kind">, value: number) {
  if (chart.format !== "peso") {
    return value.toLocaleString();
  }
  // columns are narrow so shorten, e.g. ₱124K
  return chart.kind === "columns" ? compactPeso.format(value) : formatPesoShort(value);
}

export function hasChartData(chart: ReportChart) {
  return chart.data.some((entry) => entry.value > 0);
}
