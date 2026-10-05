import { requireInventoryAccess } from "@/lib/inventory-auth";
import { buildReport, downloadName } from "@/lib/reports/build";
import { recordExport } from "@/lib/reports/export-log";
import { ReportRequestError } from "@/lib/reports/model";
import { renderReportPdf } from "@/lib/reports/pdf/render";

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

// The printable version of a report: the same filters as the page, drawn as a PDF.
export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  try {
    const report = await buildReport(new URL(request.url).searchParams, "pdf");
    const bytes = await renderReportPdf(report);
    await recordExport(user, report.kind, "PDF");
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${downloadName(report, "pdf")}"`,
        "Content-Type": "application/pdf",
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
