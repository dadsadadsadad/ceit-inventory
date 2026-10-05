import type { ReportExportFilters } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

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
