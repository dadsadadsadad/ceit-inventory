export const metadata = { title: "Maintenance checklist · CEIT Inventory" };

import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark } from "@/app/components/brand-mark";
import { PrintButton } from "@/app/components/print-button";
import { isUuid } from "@/lib/ids";
import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";
import { intervalLabel, planScopeLabel, shortDay } from "@/lib/maintenance-plans";
import { dayValue, planItemsWhere } from "@/lib/maintenance-plan-queries";
import { formatManilaDate } from "@/lib/manila-date";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

// longest list that still prints in a few pages
const maxRows = 500;

// a paper form to take on the rounds, ticked by hand and signed
export default async function MaintenanceChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireInventoryManagementPageAccess();
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const plan = await prisma.maintenancePlan.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      location: { select: { name: true } },
      item: { select: { name: true } },
    },
  });
  if (!plan) {
    notFound();
  }
  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: planItemsWhere(plan),
      select: {
        id: true,
        name: true,
        assetTag: true,
        location: { select: { name: true } },
      },
      orderBy: [{ location: { name: "asc" } }, { assetTag: "asc" }, { name: "asc" }],
      take: maxRows,
    }),
    prisma.inventoryItem.count({ where: planItemsWhere(plan) }),
  ]);

  return (
    <div className="page checklist-page">
      <div className="page-inner space-y-6">
        <header className="no-print flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href={`/dashboard/maintenance?view=preventive#plan-${plan.id}`}
              className="accent-link text-sm font-semibold"
            >
              ← Preventive maintenance
            </Link>
            <h1 className="title mt-4 text-3xl">Checklist</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Print it, tick each item on the rounds, then mark the schedule done.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PrintButton className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold" />
          </div>
        </header>

        <article className="report-sheet" aria-label={`${plan.title} checklist`}>
          <header className="report-sheet-head">
            <BrandMark size={64} />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Preventive maintenance checklist</p>
              <h2 className="report-title">{plan.title}</h2>
              <p className="muted text-sm">
                {planScopeLabel(plan)} · {intervalLabel(plan.intervalDays)} · Due{" "}
                {shortDay(dayValue(plan.nextDueOn))}. Printed{" "}
                {formatManilaDate(new Date(), { dateStyle: "medium" })}.
              </p>
            </div>
          </header>

          {plan.notes ? (
            <section className="report-section" aria-label="Steps">
              <div className="report-section-head">
                <h3>Steps</h3>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">{plan.notes}</p>
            </section>
          ) : null}

          <section className="report-section" aria-label="Items">
            <div className="report-section-head">
              <h3>Items</h3>
              <span className="muted text-sm">
                {total.toLocaleString()} {total === 1 ? "item" : "items"}
              </span>
            </div>
            {total > items.length ? (
              <p className="muted text-sm">
                Only the first {maxRows} are listed. Use a narrower schedule for a shorter list.
              </p>
            ) : null}
            {items.length ? (
              <div className="report-table-wrap">
                <table className="report-table checklist-table">
                  <colgroup>
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Item</th>
                      <th scope="col">Asset tag</th>
                      <th scope="col">Room</th>
                      <th scope="col">Done</th>
                      <th scope="col">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.id}>
                        <td data-label="#">{index + 1}</td>
                        <td data-label="Item">
                          <strong>{item.name}</strong>
                        </td>
                        <td data-label="Asset tag" className="asset-code">
                          {item.assetTag ?? "No asset tag"}
                        </td>
                        <td data-label="Room">{item.location.name}</td>
                        <td data-label="Done">
                          <span className="checklist-box" aria-hidden="true" />
                        </td>
                        <td data-label="Remarks" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted text-sm">No items match this schedule right now.</p>
            )}
          </section>

          <section className="checklist-signoff" aria-label="Sign-off">
            <div>
              <span>Done by</span>
            </div>
            <div>
              <span>Date</span>
            </div>
            <div>
              <span>Checked by</span>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
