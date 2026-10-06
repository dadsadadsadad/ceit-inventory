import "server-only";

import { parseReportExportFilters } from "@/lib/report-export-filters";
import { manilaCalendarDate } from "@/lib/manila-date";

import { buildActivityReport } from "./builders/activity";
import { buildBorrowingReport } from "./builders/borrowing";
import { buildHardwareReport } from "./builders/hardware";
import { buildInventoryReport } from "./builders/inventory";
import { buildMaintenanceReport } from "./builders/maintenance";
import { buildOverviewReport } from "./builders/overview";
import { buildPcRegisterReport } from "./builders/pcs";
import { buildSoftwareReport } from "./builders/software";
import { buildStockReport } from "./builders/stock";
import { buildWarrantyReport } from "./builders/warranty";
import type { BuilderContext } from "./builders/shared";
import { isReportKind, reportKindInfo, type ReportKind } from "./kinds";
import { reportFilename, ReportRequestError, type ReportModel, type ReportPurpose } from "./model";

const builders: Record<ReportKind, (context: BuilderContext) => Promise<ReportModel>> = {
  activity: buildActivityReport,
  borrowing: buildBorrowingReport,
  hardware: buildHardwareReport,
  inventory: buildInventoryReport,
  maintenance: buildMaintenanceReport,
  overview: buildOverviewReport,
  pcs: buildPcRegisterReport,
  software: buildSoftwareReport,
  stock: buildStockReport,
  warranty: buildWarrantyReport,
};

/**
 * Build one report from the page's query string. Throws a `ReportRequestError` for a request that
 * can not be answered, such as an unknown report or a download that is too large.
 */
export async function buildReport(
  parameters: URLSearchParams,
  purpose: ReportPurpose,
  now = new Date(),
) {
  // Older links called the borrowing report "borrowings".
  const requested = parameters.get("kind") ?? "overview";
  const kind = requested === "borrowings" ? "borrowing" : requested;
  if (!isReportKind(kind)) {
    throw new ReportRequestError("Unknown report.");
  }
  let filters: ReturnType<typeof parseReportExportFilters>;
  try {
    filters = parseReportExportFilters(parameters, now);
  } catch (error) {
    throw new ReportRequestError(error instanceof Error ? error.message : "Invalid filters.");
  }
  return builders[kind]({ filters, now, parameters, purpose });
}

/** The download name: the report, "-filtered" when narrowed, and today's date in Manila. */
export function downloadName(report: ReportModel, extension: "csv" | "pdf", now = new Date()) {
  return reportFilename(
    reportKindInfo[report.kind].stem,
    manilaCalendarDate(now),
    report.narrowed ?? report.filters.length > 0,
    extension,
  );
}
