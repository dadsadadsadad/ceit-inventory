import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { Prisma } from "@prisma/client";

import {
  auditActionLabel,
  auditActorLabel,
  auditCategory,
  auditChangedFields,
  auditEventDetail,
  groupEventsByDay,
  type AuditTrailEvent,
} from "@/lib/audit-trail";
import { formatManilaDate } from "@/lib/manila-date";

export type ActivityEvent = Prisma.InventoryAuditGetPayload<{
  include: { item: { select: { assetTag: true; id: true; name: true } } };
}>;

function toneFor(category: string) {
  switch (category) {
    case "Borrowing":
      return "borrowing";
    case "Maintenance":
      return "maintenance";
    case "Accounts":
    case "Calendar":
    case "Dashboard notes":
    case "Configuration":
      return "setup";
    case "QR code scan":
    case "QR code":
    case "Report export":
    case "Access":
      return "routine";
    default:
      return "inventory";
  }
}

function timeOf(value: Date) {
  return formatManilaDate(value, { hour: "numeric", minute: "2-digit" });
}

// Events for one page, grouped by day, each a single line that opens for the details.
export function AuditEventList({ events }: { events: ActivityEvent[] }) {
  const days = groupEventsByDay(events);

  return (
    <div className="audit-days">
      {days.map((day) => (
        <section key={day.key} aria-labelledby={`audit-day-${day.key}`}>
          <h2 id={`audit-day-${day.key}`} className="audit-day">
            {day.label}
          </h2>
          <ol className="audit-list">
            {day.events.map((event) => {
              const category = auditCategory(event as AuditTrailEvent);
              const detail = auditEventDetail(event as AuditTrailEvent);
              const changes = auditChangedFields(event as AuditTrailEvent);
              const subject = event.item?.name ?? event.entityLabel ?? null;
              const actor = auditActorLabel(event as AuditTrailEvent);
              return (
                <li key={event.id} className="audit-entry">
                  <details className="audit-details">
                    <summary className="audit-summary">
                      <time className="audit-time" dateTime={event.createdAt.toISOString()}>
                        {timeOf(event.createdAt)}
                      </time>
                      <span className={`audit-tag audit-tag-${toneFor(category)}`}>{category}</span>
                      <span className="audit-text">
                        <strong>{event.summary}</strong>
                        <small>{[subject, actor].filter(Boolean).join(" · ")}</small>
                      </span>
                      <ChevronDown className="audit-chevron" size={18} aria-hidden="true" />
                    </summary>
                    <div className="audit-body">
                      <dl className="audit-facts">
                        <div>
                          <dt>Event</dt>
                          <dd>{auditActionLabel(event.action)}</dd>
                        </div>
                        <div>
                          <dt>Record</dt>
                          <dd>
                            {event.item ? (
                              <Link
                                href={`/dashboard/inventory/${event.item.id}`}
                                className="accent-link font-semibold"
                              >
                                {event.item.name}
                              </Link>
                            ) : (
                              (event.entityLabel ?? "No linked record")
                            )}
                            {event.item?.assetTag ? (
                              <span className="muted asset-code"> · {event.item.assetTag}</span>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt>By</dt>
                          <dd>{actor}</dd>
                        </div>
                        <div>
                          <dt>When</dt>
                          <dd>
                            {formatManilaDate(event.createdAt, {
                              dateStyle: "medium",
                              timeStyle: "medium",
                            })}
                          </dd>
                        </div>
                      </dl>
                      {detail ? <p className="muted text-sm leading-6">{detail}</p> : null}
                      {changes.length ? (
                        <div className="mt-3 flex flex-wrap gap-2" aria-label="What changed">
                          {changes.map((change) => (
                            <span
                              key={change.label}
                              className="card-muted max-w-full rounded-md px-2.5 py-1 text-sm"
                            >
                              <strong>{change.label}:</strong>{" "}
                              <span className="break-all">{change.value}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
