import { recordExport } from "@/lib/reports/export-log";
import {
  canManageAdministration,
  canManageInventory,
  requireInventoryAccess,
  type InventoryUser,
} from "@/lib/inventory-auth";
import { manilaCalendarDate } from "@/lib/manila-date";
import { parseReportExportFilters, type ReportExportFilters } from "@/lib/report-export-filters";
import { createInventoryPdf } from "@/lib/reports/pdf/inventory";
import { createPcRegisterPdf } from "@/lib/reports/pdf/pcs";
import { createBorrowingsPdf } from "@/lib/reports/pdf/borrowing";
import { createMaintenancePdf } from "@/lib/reports/pdf/maintenance";
import { createAuditPdf } from "@/lib/reports/pdf/activity";
import { createOverviewPdf } from "@/lib/reports/pdf/overview";

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

async function auditPdfDownload(user: InventoryUser, kind: string, response: Response) {
  const isPdfDownload =
    response.ok && response.headers.get("Content-Type")?.startsWith("application/pdf");
  if (!isPdfDownload) {
    return response;
  }

  await recordExport(user, kind, "PDF");
  return response;
}

// Check access before building the report.
export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  const parameters = new URL(request.url).searchParams;
  const kind = parameters.get("kind");
  const calendarDate = manilaCalendarDate();
  const canManage = canManageInventory(user.role);

  if (!kind || kind === "overview") {
    return auditPdfDownload(user, "overview", await createOverviewPdf(canManage, calendarDate));
  }

  if (kind === "activity") {
    if (!canManageAdministration(user.role)) {
      return new Response("Forbidden", { status: 403 });
    }
    return auditPdfDownload(user, "activity", await createAuditPdf(parameters, calendarDate));
  }

  let filters: ReportExportFilters;
  try {
    filters = parseReportExportFilters(parameters);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid export filters.", {
      status: 400,
    });
  }

  if (kind === "inventory") {
    return auditPdfDownload(user, "inventory", await createInventoryPdf(filters, calendarDate));
  }
  if (!canManage) {
    return new Response("Forbidden", { status: 403 });
  }
  if (kind === "pcs") {
    return auditPdfDownload(user, "pcs", await createPcRegisterPdf(filters, calendarDate));
  }
  if (kind === "borrowings") {
    return auditPdfDownload(user, "borrowings", await createBorrowingsPdf(filters, calendarDate));
  }
  if (kind === "maintenance") {
    return auditPdfDownload(user, "maintenance", await createMaintenancePdf(filters, calendarDate));
  }
  return new Response("Unknown export", { status: 400 });
}
