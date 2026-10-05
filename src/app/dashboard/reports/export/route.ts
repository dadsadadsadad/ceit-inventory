import { requireInventoryAccess } from "@/lib/inventory-auth";
import { buildReport, downloadName } from "@/lib/reports/build";
import { createCsv } from "@/lib/reports/csv";
import { recordExport } from "@/lib/reports/export-log";
import { csvRows, ReportRequestError } from "@/lib/reports/model";

export const dynamic = "force-dynamic";

// The spreadsheet version of a report: the same filters as the page, in a CSV file.
export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  try {
    const report = await buildReport(new URL(request.url).searchParams, "csv");
    await recordExport(user, report.kind, "CSV");
    return new Response("﻿" + createCsv(csvRows(report)), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${downloadName(report, "csv")}"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ReportRequestError) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  }
}
