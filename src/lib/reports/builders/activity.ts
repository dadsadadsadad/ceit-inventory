import {
  auditActionLabel,
  auditActorLabel,
  auditCategory,
  auditChangedFields,
  auditEventDetail,
  auditTrailWhere,
  auditViewLabel,
  defaultAuditView,
  parseAuditTrailFilters,
  type AuditTrailEvent,
} from "@/lib/audit-trail";
import { prisma } from "@/prisma";

import { chips, dateRangeChip, formatReportDateTime } from "../format";
import { ReportRequestError, type ReportModel } from "../model";
import { loadCapped, type BuilderContext } from "./shared";

// Show changed fields or a short event detail.
function eventDetail(event: AuditTrailEvent) {
  const changes = auditChangedFields(event).map((change) => `${change.label}: ${change.value}`);
  return changes.join(" · ") || auditEventDetail(event);
}

// Who changed what, and when, for the chosen view of the audit trail.
export async function buildActivityReport(context: BuilderContext): Promise<ReportModel> {
  let filters: ReturnType<typeof parseAuditTrailFilters>;
  try {
    filters = parseAuditTrailFilters(context.parameters, context.now);
  } catch (error) {
    throw new ReportRequestError(
      error instanceof Error ? error.message : "Invalid audit filters.",
      400,
    );
  }
  const where = auditTrailWhere(filters);

  const [{ rows: events, total }, people, actions] = await Promise.all([
    loadCapped(context, {
      find: (take) =>
        prisma.inventoryAudit.findMany({
          where,
          include: { item: { select: { assetTag: true, name: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
        }),
      count: () => prisma.inventoryAudit.count({ where }),
    }),
    prisma.inventoryAudit.groupBy({ by: ["actorName"], where }),
    prisma.inventoryAudit.groupBy({
      by: ["action"],
      where,
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 1,
    }),
  ]);
  const topAction = actions[0];

  return {
    kind: "activity",
    title: "Audit trail",
    description: "Who changed what, and when.",
    filters: chips(
      `Showing: ${auditViewLabel(filters.view)}`,
      filters.action && `Event: ${auditActionLabel(filters.action)}`,
      filters.actor && `Person: ${filters.actor}`,
      filters.query && `Search: “${filters.query}”`,
      dateRangeChip(filters.dateRange, "Dates"),
    ),
    generatedAt: context.now,
    narrowed: Boolean(
      filters.view !== defaultAuditView(filters.action) ||
      filters.action ||
      filters.actor ||
      filters.query ||
      filters.dateRange.from ||
      filters.dateRange.toExclusive,
    ),
    metrics: [
      { label: "Events", value: total.toLocaleString() },
      { label: "People involved", value: people.length.toLocaleString() },
      {
        label: "Most common event",
        value: topAction ? auditActionLabel(topAction.action) : "None",
        note: topAction ? `${topAction._count._all.toLocaleString()} times` : undefined,
      },
    ],
    tables: [
      {
        heading: "Events",
        columns: [
          { label: "When", width: 1.3 },
          { label: "Event", width: 2.5, primary: true },
          { label: "Record", width: 1.3 },
          { label: "By", width: 1 },
        ],
        rows: events.map((event) => [
          formatReportDateTime(event.createdAt),
          [
            event.summary,
            `${auditCategory(event)} · ${auditActionLabel(event.action)}`,
            eventDetail(event),
          ]
            .filter(Boolean)
            .join("\n"),
          [event.item?.name ?? event.entityLabel ?? "No linked record", event.item?.assetTag]
            .filter(Boolean)
            .join("\n"),
          auditActorLabel(event),
        ]),
        total,
        emptyText: "No events match these filters.",
      },
    ],
    csv: [
      ["When", "Category", "Event", "Subject", "Asset tag", "User", "Summary", "What changed"],
      ...events.map((event) => [
        event.createdAt,
        auditCategory(event),
        auditActionLabel(event.action),
        event.item?.name ?? event.entityLabel ?? "System",
        event.item?.assetTag ?? "",
        auditActorLabel(event),
        event.summary,
        auditChangedFields(event)
          .map((change) => `${change.label}: ${change.value}`)
          .join(" · "),
      ]),
    ],
  };
}
