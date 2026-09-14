import { prisma } from "@/prisma";
import {
  auditActionLabel,
  auditActorLabel,
  auditCategory,
  auditChangedFields,
  auditEventDetail,
  auditTrailWhere,
  parseAuditTrailFilters,
  type AuditTrailEvent,
} from "@/lib/audit-trail";
import { documentResponse, reportDocument, mutedColor } from "../pdf-writer";
import { formatReportDateTime, filterLabel } from "../format";
import { pdfRowLimit } from "../limits";

// Show changed fields or a short event detail.
function auditPdfDetail(event: AuditTrailEvent) {
  const changes = auditChangedFields(event).map((change) => `${change.label}: ${change.value}`);
  return changes.join(" | ") || auditEventDetail(event);
}

// Audit events for the selected filters.
export async function createAuditPdf(parameters: URLSearchParams, calendarDate: string) {
  let filters: ReturnType<typeof parseAuditTrailFilters>;
  try {
    filters = parseAuditTrailFilters(parameters);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid audit filters.", {
      status: 400,
    });
  }
  const activity = await prisma.inventoryAudit.findMany({
    where: auditTrailWhere(filters),
    include: { item: { select: { assetTag: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pdfRowLimit + 1,
  });
  if (activity.length > pdfRowLimit) {
    return new Response(
      `This export exceeds ${pdfRowLimit.toLocaleString()} records. Narrow the data before exporting.`,
      { status: 413 },
    );
  }
  const actionCounts = new Map<string, number>();
  activity.forEach((event) =>
    actionCounts.set(event.action, (actionCounts.get(event.action) ?? 0) + 1),
  );
  const hasAuditFilters = Boolean(
    filters.dateRange.from ||
    filters.dateRange.toExclusive ||
    filters.action ||
    filters.actor ||
    filters.query,
  );

  const { document, writer } = await reportDocument("Audit trail", "Recorded activity");
  writer.addBody("Recorded activity.", 10, mutedColor);
  writer.addBody(
    [
      filterLabel({
        borrowingState: "all",
        borrowingStatus: undefined,
        dateRange: filters.dateRange,
        inventoryStatus: undefined,
        pcOnly: false,
        period: filters.period,
      }),
      filters.action ? `Action: ${auditActionLabel(filters.action)}` : null,
      filters.actor ? `User: ${filters.actor}` : null,
      filters.query ? `Search: ${filters.query}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    8.5,
    mutedColor,
  );
  writer.addHeading("Summary");
  writer.addMetricRow([
    { label: "Events", value: activity.length.toLocaleString() },
    {
      label: "Updates",
      value: (
        (actionCounts.get("UPDATED") ?? 0) +
        (actionCounts.get("MOVED") ?? 0) +
        (actionCounts.get("STATUS_CHANGED") ?? 0)
      ).toLocaleString(),
    },
    { label: "QR scans", value: (actionCounts.get("SCANNED") ?? 0).toLocaleString() },
  ]);
  writer.addHeading("Activity");
  writer.addTable(
    ["Reference / date", "Event", "Subject", "User"],
    activity.map((event) => [
      [`AUD-${event.id.slice(0, 8).toUpperCase()}`, formatReportDateTime(event.createdAt)].join(
        "\n",
      ),
      [
        `${auditCategory(event)} | ${auditActionLabel(event.action)}`,
        event.summary,
        auditPdfDetail(event),
      ]
        .filter(Boolean)
        .join("\n"),
      [
        event.item?.name ?? event.entityLabel ?? "System",
        event.item?.assetTag ?? event.entityId ?? "No linked record",
      ].join("\n"),
      auditActorLabel(event),
    ]),
    { fontSize: 8.1, maxCellCharacters: 180, widths: [1.08, 2.2, 1.32, 1.05] },
  );
  writer.finish();
  return documentResponse(
    document,
    `ceit-audit-trail${hasAuditFilters ? "-filtered" : ""}-${calendarDate}.pdf`,
  );
}
