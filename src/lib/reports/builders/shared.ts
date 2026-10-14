import type { Prisma } from "@prisma/client";

import type { ReportExportFilters } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

import { recentMonths } from "../charts";
import { reportRowLimits, type ReportPurpose, ReportRequestError } from "../model";

/** What a builder needs to know about the request it is answering. */
export type BuilderContext = {
  filters: ReportExportFilters;
  now: Date;
  parameters: URLSearchParams;
  purpose: ReportPurpose;
};

/** The room and category names behind the ids in the filters, for the filter summary. */
export async function filterNames(filters: Pick<ReportExportFilters, "categoryId" | "locationId">) {
  const [category, location] = await Promise.all([
    filters.categoryId
      ? prisma.category.findUnique({ where: { id: filters.categoryId }, select: { name: true } })
      : null,
    filters.locationId
      ? prisma.location.findUnique({ where: { id: filters.locationId }, select: { name: true } })
      : null,
  ]);
  return { category: category?.name, location: location?.name };
}

/**
 * Read one page of records for a preview, or everything a download can hold. A preview also
 * counts what it left out; a download that would not fit is refused rather than cut short.
 */
export async function loadCapped<T>(
  context: Pick<BuilderContext, "purpose">,
  query: { count: () => Promise<number>; find: (take: number) => Promise<T[]> },
  noun = "records",
) {
  const limit = reportRowLimits[context.purpose];
  if (context.purpose === "preview") {
    const [rows, total] = await Promise.all([query.find(limit), query.count()]);
    return { rows, total };
  }
  const rows = await query.find(limit + 1);
  if (rows.length > limit) {
    throw new ReportRequestError(
      `This ${context.purpose === "csv" ? "CSV" : "PDF"} would hold more than ${limit.toLocaleString()} ${noun}. Narrow the filters${context.purpose === "pdf" ? " or download the CSV instead" : ""}.`,
      413,
    );
  }
  return { rows, total: rows.length };
}

/** How many matching records each room holds, for a chart. Counts everything, not one page. */
export async function countsByRoom(where: Prisma.InventoryItemWhereInput) {
  const groups = await prisma.inventoryItem.groupBy({
    by: ["locationId"],
    where,
    _count: { _all: true },
  });
  const rooms = await prisma.location.findMany({
    where: { id: { in: groups.map((group) => group.locationId) } },
    select: { id: true, name: true },
  });
  const names = new Map(rooms.map((room) => [room.id, room.name]));
  return groups.map((group): [string, number] => [
    names.get(group.locationId) ?? "Unknown room",
    group._count._all,
  ]);
}

/** How many matching records each category holds, for a chart. */
export async function countsByCategory(where: Prisma.InventoryItemWhereInput) {
  const groups = await prisma.inventoryItem.groupBy({
    by: ["categoryId"],
    where,
    _count: { _all: true },
  });
  const categories = await prisma.category.findMany({
    where: { id: { in: groups.map((group) => group.categoryId) } },
    select: { id: true, name: true },
  });
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return groups.map((group): [string, number] => [
    names.get(group.categoryId) ?? "Unknown category",
    group._count._all,
  ]);
}

/** One count per recent month, for a chart over time. */
export async function monthlyCounts(
  now: Date,
  count: (range: { gte: Date; lt: Date }) => Promise<number>,
  months = 6,
) {
  const periods = recentMonths(now, months);
  const values = await Promise.all(
    periods.map((period) => count({ gte: period.start, lt: period.end })),
  );
  return periods.map((period, index): [string, number] => [period.label, values[index]]);
}

/** Item names for the equipment that appears most often in a grouped count. */
export async function namedItemCounts(groups: { count: number; inventoryItemId: string }[]) {
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: groups.map((group) => group.inventoryItemId) } },
    select: { id: true, name: true, assetTag: true },
  });
  // The asset tag is added only where two items share a name, so labels stay short.
  const repeated = new Set(
    items.map((item) => item.name).filter((name, index, all) => all.indexOf(name) !== index),
  );
  const names = new Map(
    items.map((item) => [
      item.id,
      repeated.has(item.name) && item.assetTag ? `${item.name} (${item.assetTag})` : item.name,
    ]),
  );
  return groups.map((group): [string, number] => [
    names.get(group.inventoryItemId) ?? "Removed item",
    group.count,
  ]);
}
