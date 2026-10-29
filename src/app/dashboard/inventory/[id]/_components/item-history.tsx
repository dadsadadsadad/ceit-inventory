import Link from "next/link";

import { borrowStatusLabel } from "@/lib/borrow-status";
import { intervalLabel, planDue, planDueClass } from "@/lib/maintenance-plans";
import { formatManilaDate } from "@/lib/manila-date";
import { personName } from "@/lib/person";

import type { ItemRecord } from "./item-record";

type ItemPlan = { id: string; intervalDays: number; nextDue: string; title: string };

export function ItemHistory({
  item,
  plans,
  today,
}: {
  item: ItemRecord;
  plans: ItemPlan[];
  today: string;
}) {
  return (
    <>
      <article className="card rounded-lg p-5 sm:p-6">
        <div className="mb-6 space-y-5">
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
                      {borrowStatusLabel(request.status)} ·{" "}
                      {formatManilaDate(request.startsAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      -{" "}
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
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Preventive maintenance</h2>
              <Link
                href={`/dashboard/maintenance?view=preventive&item=${item.id}#add-schedule`}
                className="accent-link text-xs"
              >
                Add a schedule
              </Link>
            </div>
            {plans.length ? (
              <ul className="mt-3 space-y-2">
                {plans.map((plan) => {
                  const due = planDue(plan.nextDue, today);
                  return (
                    <li key={plan.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        href={`/dashboard/maintenance?view=preventive#plan-${plan.id}`}
                        className="font-medium hover:underline"
                      >
                        {plan.title}
                      </Link>
                      <span className="muted text-xs">{intervalLabel(plan.intervalDays)}</span>
                      <span
                        className={`${planDueClass(due.state)} rounded-md px-2 py-0.5 text-xs font-semibold`}
                      >
                        {due.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted mt-2 text-sm">No schedules cover this item.</p>
            )}
          </section>
        </div>
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {item.auditEvents.length ? (
          <ol className="mt-4 space-y-3">
            {item.auditEvents.map((event) => (
              <li key={event.id} className="divider border-l pl-4 text-sm">
                <p className="font-semibold">{event.summary}</p>
                <p className="muted mt-1 text-xs">
                  {personName(event.actorName) ?? "System"} ·{" "}
                  {formatManilaDate(event.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted mt-3 text-sm">No activity yet.</p>
        )}
      </article>
    </>
  );
}
