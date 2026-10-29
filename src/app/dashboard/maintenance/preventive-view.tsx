import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { EmptyState } from "@/app/components/empty-state";
import { FeedbackForm } from "@/app/components/feedback-form";
import { HoldSubmitButton } from "@/app/components/hold-submit-button";
import { SubmitButton } from "@/app/components/submit-button";
import { formatManilaDate } from "@/lib/manila-date";
import {
  intervalLabel,
  planDue,
  planDueClass,
  planScopeLabel,
  shortDay,
} from "@/lib/maintenance-plans";
import { countDuePlans, loadMaintenancePlans } from "@/lib/maintenance-plan-queries";
import { prisma } from "@/prisma";

import {
  completeMaintenancePlan,
  createMaintenancePlan,
  deleteMaintenancePlan,
  setMaintenancePlanActive,
  updateMaintenancePlan,
} from "./plan-actions";
import { PlanFields } from "./plan-fields";

function doneDate(value: Date) {
  return formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" });
}

function scopeHref(plan: {
  categoryId: string | null;
  itemId: string | null;
  locationId: string | null;
}) {
  if (plan.itemId) {
    return `/dashboard/inventory/${plan.itemId}`;
  }
  const params = new URLSearchParams();
  if (plan.locationId) {
    params.set("location", plan.locationId);
  }
  if (plan.categoryId) {
    params.set("category", plan.categoryId);
  }
  return `/dashboard/inventory?${params}`;
}

export async function PreventiveView({
  adding,
  itemId,
  now,
  today,
}: {
  adding: boolean;
  itemId?: string;
  now: Date;
  today: string;
}) {
  const [plans, due, categories, locations, forItem] = await Promise.all([
    loadMaintenancePlans(),
    countDuePlans(today),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
    // coming from an item page, start the new schedule with that item
    itemId
      ? prisma.inventoryItem.findUnique({
          where: { id: itemId },
          select: { id: true, name: true, assetTag: true, location: { select: { name: true } } },
        })
      : Promise.resolve(null),
  ]);
  const startItem = forItem
    ? {
        id: forItem.id,
        name: forItem.name,
        assetTag: forItem.assetTag,
        location: forItem.location.name,
      }
    : null;
  const lastMonth = plans.reduce(
    (sum, plan) =>
      sum +
      plan.logs.filter((log) => log.doneAt.getTime() > now.getTime() - 30 * 86_400_000).length,
    0,
  );

  return (
    <>
      <section className="directory-stats" aria-label="Preventive maintenance summary">
        <div>
          <span className="muted text-sm">Overdue</span>
          <strong className={due.overdue ? "stat-critical" : undefined}>
            {due.overdue.toLocaleString()}
          </strong>
        </div>
        <div>
          <span className="muted text-sm">Due this week</span>
          <strong>{(due.dueToday + due.soon).toLocaleString()}</strong>
        </div>
        <div>
          <span className="muted text-sm">Active schedules</span>
          <strong>{due.active.toLocaleString()}</strong>
        </div>
        <div>
          <span className="muted text-sm">Done in 30 days</span>
          <strong>{lastMonth.toLocaleString()}</strong>
        </div>
      </section>

      <details
        id="add-schedule"
        className="section-disclosure card scroll-mt-24 rounded-lg p-5 sm:p-6"
        open={adding || Boolean(startItem) || !plans.length}
      >
        <summary className="cursor-pointer text-lg font-semibold">Add a schedule</summary>
        <p className="muted text-sm leading-6">
          A job that repeats, like cleaning a lab&apos;s PCs every month. Marking it done marks
          every item it covers as checked and sets the next due date.
        </p>
        <FeedbackForm
          action={createMaintenancePlan}
          successMessage="Schedule added."
          className="mt-5 space-y-4"
        >
          <PlanFields
            categories={categories}
            locations={locations}
            startItem={startItem}
            today={today}
          />
          <SubmitButton
            pendingLabel="Adding..."
            className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Add schedule
          </SubmitButton>
        </FeedbackForm>
      </details>

      <section className="space-y-4" aria-label="Preventive maintenance schedules">
        {plans.length ? (
          plans.map((plan) => {
            const dueState = planDue(plan.nextDue, today);
            const isDue = dueState.state === "overdue" || dueState.state === "today";
            return (
              <article
                key={plan.id}
                id={`plan-${plan.id}`}
                className={`card plan-card scroll-mt-24 rounded-lg p-5 sm:p-6 ${plan.isActive ? "" : "is-paused"}`}
              >
                <div className="maintenance-ticket-grid">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {plan.isActive ? (
                        <span
                          className={`${planDueClass(dueState.state)} rounded-md px-2.5 py-1 text-xs font-semibold`}
                        >
                          {dueState.label}
                        </span>
                      ) : (
                        <span className="status-pill status-pill-retired rounded-md px-2.5 py-1 text-xs font-semibold">
                          Paused
                        </span>
                      )}
                      <span className="card-muted rounded-md px-2.5 py-1 text-xs font-semibold">
                        {intervalLabel(plan.intervalDays)}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold">{plan.title}</h2>
                    <Link
                      href={scopeHref(plan)}
                      className="accent-link mt-1 inline-block text-sm font-semibold"
                    >
                      {planScopeLabel(plan)} · {plan.itemCount.toLocaleString()}{" "}
                      {plan.itemCount === 1 ? "item" : "items"}
                    </Link>
                    {plan.notes ? (
                      <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6">
                        {plan.notes}
                      </p>
                    ) : null}
                    <p className="muted mt-3 text-xs">
                      {plan.lastDoneAt
                        ? `Last done ${doneDate(plan.lastDoneAt)}${plan.lastDoneByName ? ` by ${plan.lastDoneByName}` : ""}`
                        : "Not done yet"}
                      {plan.isActive && dueState.state !== "later"
                        ? ` · Next due ${shortDay(plan.nextDue)}`
                        : ""}
                    </p>
                    {plan.logs.length ? (
                      <details className="plan-history mt-3">
                        <summary className="accent-link cursor-pointer text-sm font-semibold">
                          History
                        </summary>
                        <ol className="mt-2 space-y-2">
                          {plan.logs.map((log) => (
                            <li key={log.id} className="divider border-l pl-3 text-sm">
                              <span className="font-semibold">{doneDate(log.doneAt)}</span>
                              <span className="muted">
                                {" "}
                                · {log.doneByName ?? "Staff"} · {log.itemCount}{" "}
                                {log.itemCount === 1 ? "item" : "items"}
                              </span>
                              {log.notes ? (
                                <span className="mt-0.5 block whitespace-pre-wrap">
                                  {log.notes}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>

                  <div className="plan-actions">
                    {plan.isActive ? (
                      <FeedbackForm
                        action={completeMaintenancePlan}
                        successMessage="Marked done."
                        className="plan-done-form"
                      >
                        <input type="hidden" name="id" value={plan.id} />
                        <label className="block">
                          <span className="sr-only">Notes for {plan.title}</span>
                          <input
                            name="notes"
                            maxLength={1_000}
                            className="field w-full rounded-lg px-3 py-2.5 text-sm"
                            placeholder="Notes (optional)"
                          />
                        </label>
                        <SubmitButton
                          pendingLabel="Saving..."
                          className={`${isDue ? "primary-button" : "secondary-button"} rounded-lg px-4 py-2.5 text-sm font-semibold`}
                        >
                          Mark done
                        </SubmitButton>
                      </FeedbackForm>
                    ) : null}
                    <Link
                      href={`/dashboard/maintenance/checklist/${plan.id}`}
                      className="accent-link text-sm font-semibold"
                    >
                      Print checklist
                    </Link>
                    <Link
                      href={
                        plan.itemId
                          ? `/dashboard/maintenance?item=${plan.itemId}#report-issue`
                          : "/dashboard/maintenance?report=1#report-issue"
                      }
                      className="accent-link text-sm font-semibold"
                    >
                      Found a problem? Report it
                    </Link>
                    <details className="section-disclosure min-w-0">
                      <summary className="accent-link cursor-pointer text-sm font-semibold">
                        Edit schedule
                      </summary>
                      <FeedbackForm
                        action={updateMaintenancePlan}
                        successMessage="Schedule saved."
                        resetOnSuccess={false}
                        className="space-y-4"
                      >
                        <input type="hidden" name="id" value={plan.id} />
                        <PlanFields
                          categories={categories}
                          locations={locations}
                          today={today}
                          plan={{
                            title: plan.title,
                            notes: plan.notes,
                            intervalDays: plan.intervalDays,
                            nextDue: plan.nextDue,
                            categoryId: plan.categoryId,
                            locationId: plan.locationId,
                            item: plan.item
                              ? {
                                  id: plan.item.id,
                                  name: plan.item.name,
                                  assetTag: plan.item.assetTag,
                                  location: plan.item.location.name,
                                }
                              : null,
                          }}
                        />
                        <SubmitButton className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">
                          Save changes
                        </SubmitButton>
                      </FeedbackForm>
                      <div className="mt-4 flex flex-wrap items-start gap-3">
                        <FeedbackForm
                          action={setMaintenancePlanActive}
                          successMessage={plan.isActive ? "Paused." : "Resumed."}
                        >
                          <input type="hidden" name="id" value={plan.id} />
                          {plan.isActive ? null : (
                            <input type="hidden" name="isActive" value="on" />
                          )}
                          <SubmitButton
                            pendingLabel="Saving..."
                            className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                          >
                            {plan.isActive ? "Pause" : "Resume"}
                          </SubmitButton>
                        </FeedbackForm>
                      </div>
                      <details className="danger-zone mt-4 rounded-lg p-3">
                        <summary className="cursor-pointer text-sm font-semibold">
                          Remove this schedule
                        </summary>
                        <p className="mt-2 text-xs leading-5">
                          Removes the schedule and its history. Items keep their last checked dates.
                        </p>
                        <FeedbackForm action={deleteMaintenancePlan} className="mt-3">
                          <input type="hidden" name="id" value={plan.id} />
                          <HoldSubmitButton
                            label="Remove schedule"
                            pendingLabel="Removing..."
                            confirmation={`Remove "${plan.title}"? Its history is removed too.`}
                          />
                        </FeedbackForm>
                      </details>
                    </details>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState icon={CalendarCheck} title="No schedules yet.">
            Add one above, like cleaning a lab&apos;s PCs every month.
          </EmptyState>
        )}
      </section>
    </>
  );
}
