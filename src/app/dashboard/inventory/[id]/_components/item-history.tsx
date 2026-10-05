import Link from "next/link";

import { formatManilaDate } from "@/lib/manila-date";

import type { ItemRecord } from "./item-record";

// Open loans, open maintenance, and the latest changes to this record.
export function ItemHistory({ item }: { item: ItemRecord }) {
  return (
    <>
      <article className="card rounded-lg p-5 sm:p-6">
        <div className="mb-6 space-y-5">
          {/* Active loans and reservations for this item. */}
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Borrowing and reservations</h2>
              <Link
                href={`/dashboard/borrowing?q=${encodeURIComponent(item.assetTag ?? item.name)}`}
                className="accent-link text-xs"
              >
                View all
              </Link>
            </div>
            {item.borrowRequests.length ? (
              <ul className="mt-3 space-y-3">
                {item.borrowRequests.map((request) => (
                  <li key={request.id} className="divider border-l pl-3 text-sm">
                    <p className="font-medium">
                      {request.isReservation ? "Reservation" : "Borrowing"} · {request.borrowerName}
                    </p>
                    <p className="muted mt-1 text-xs">
                      {request.status.toLowerCase().replaceAll("_", " ")} ·{" "}
                      {formatManilaDate(request.startsAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      –{" "}
                      {formatManilaDate(request.expectedReturnDate, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted mt-2 text-sm">No active requests.</p>
            )}
          </section>
          {/* Unresolved maintenance requests. */}
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Open maintenance</h2>
              <Link href={`/dashboard/maintenance?item=${item.id}`} className="accent-link text-xs">
                View or report an issue
              </Link>
            </div>
            {item.maintenanceTickets.length ? (
              <ul className="mt-3 space-y-2">
                {item.maintenanceTickets.map((ticket) => (
                  <li key={ticket.id} className="text-sm">
                    {ticket.title}
                    {ticket.source === "QR" ? (
                      <span className="muted ml-2 text-xs">QR report</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted mt-2 text-sm">No open issues.</p>
            )}
          </section>
        </div>
        {/* Recent changes to this item. */}
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {item.auditEvents.length ? (
          <ol className="mt-4 space-y-3">
            {item.auditEvents.map((event) => (
              <li key={event.id} className="divider border-l pl-4 text-sm">
                <p className="font-semibold">{event.summary}</p>
                <p className="muted mt-1 text-xs">
                  {event.actorName ?? "System"} ·{" "}
                  {formatManilaDate(event.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted mt-3 text-sm">No activity has been recorded yet.</p>
        )}
      </article>
    </>
  );
}
