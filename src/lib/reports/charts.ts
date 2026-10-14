import { ItemStatus } from "@prisma/client";

import { inventoryStatusLabel } from "@/lib/inventory-status";
import { manilaDateText } from "@/lib/manila-date";

import type { ReportChart, ReportChartTone } from "./model";

const statusTones: Record<ItemStatus, ReportChartTone> = {
  OK: "ok",
  WORKING: "working",
  DEPLOYED: "deployed",
  DEFECTIVE: "defective",
  NOT_TESTED: "not_tested",
  RETIRED: "retired",
  LOST: "lost",
};

/** Records by equipment status, in the usual status order, in the status colours. */
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

/**
 * Amounts per category, largest first. Past `limit` the rest are folded into "Other", so a chart
 * never needs more bars than can be read at a glance.
 */
export function countChart(
  title: string,
  entries: [string, number][],
  unit: string,
  limit = 8,
): ReportChart {
  const sorted = entries
    .filter(([, value]) => value > 0)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
  const shown = sorted.length > limit ? sorted.slice(0, limit - 1) : sorted;
  const rest = sorted.slice(shown.length).reduce((total, [, value]) => total + value, 0);
  return {
    title,
    kind: "bars",
    unit,
    note: rest ? `The ${sorted.length - shown.length} smallest are grouped as Other.` : undefined,
    data: [
      ...shown.map(([label, value]) => ({ label, value })),
      ...(rest ? [{ label: "Other", value: rest }] : []),
    ],
  };
}

/** The last `months` calendar months in the Philippines, oldest first, with their boundaries. */
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

/** Counts per month as a column chart. */
export function monthChart(title: string, entries: [string, number][], unit: string): ReportChart {
  return {
    title,
    kind: "columns",
    unit,
    note: `The last ${entries.length} months.`,
    data: entries.map(([label, value]) => ({ label, value })),
  };
}

/** Whether a chart has anything worth drawing. */
export function hasChartData(chart: ReportChart) {
  return chart.data.some((entry) => entry.value > 0);
}
