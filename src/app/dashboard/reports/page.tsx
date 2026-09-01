import Link from "next/link";

import { BorrowStatus, ItemStatus, MaintenanceStatus } from "@prisma/client";

import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryStatusClass, inventoryStatusLabel } from "@/lib/inventory-status";
import { startOfManilaDay } from "@/lib/manila-date";
import { borrowingReportStates, exportPeriods } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

type SearchParams = {
  borrowingState?: string | string[];
  borrowingStatus?: string | string[];
  from?: string | string[];
  inventoryStatus?: string | string[];
  kind?: string | string[];
  pcOnly?: string | string[];
  period?: string | string[];
  to?: string | string[];
};

const philippinePeso = new Intl.NumberFormat("en-PH", { currency: "PHP", minimumFractionDigits: 2, style: "currency" });

function displayPurchasePrice(value?: { toString: () => string } | null) {
  return philippinePeso.format(Number(value?.toString() ?? 0));
}

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function validValue<T extends string>(value: string | undefined, values: readonly T[]) {
  return value && values.includes(value as T) ? value as T : "";
}

function periodLabel(period: (typeof exportPeriods)[number]) {
  const labels: Record<(typeof exportPeriods)[number], string> = {
    all: "All time",
    today: "Today",
    "last-7-days": "Last 7 days",
    "last-30-days": "Last 30 days",
    "this-month": "This month",
    "this-year": "This calendar year",
  };
  return labels[period];
}

function borrowingStateLabel(state: (typeof borrowingReportStates)[number]) {
  const labels: Record<(typeof borrowingReportStates)[number], string> = {
    all: "All lending activity",
    "currently-borrowed": "Currently borrowed (includes return requests)",
    returned: "Returned items",
    requested: "Pending requests",
    declined: "Declined requests",
  };
  return labels[state];
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [user, search] = await Promise.all([requireInventoryAccess(), searchParams]);
  const canManage = canManageInventory(user.role);
  const canAdmin = canManageAdministration(user.role);
  const today = startOfManilaDay();
  const [itemCount, statusCounts, categoryCounts, locationCounts, openTicketCount, activeBorrowCount, overdueBorrowCount, acquisitionSummary] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { items: true } } } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { items: true } } } }),
    canManage ? prisma.maintenanceTicket.count({ where: { status: { not: MaintenanceStatus.RESOLVED } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] }, expectedReturnDate: { lt: today } } }) : Promise.resolve(0),
    canManage ? prisma.inventoryItem.aggregate({ _count: { purchasePrice: true }, _sum: { purchasePrice: true } }) : Promise.resolve({ _count: { purchasePrice: 0 }, _sum: { purchasePrice: null } }),
  ]);
  const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const populatedCategories = categoryCounts.filter((category) => category._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 8);
  const populatedLocations = locationCounts.filter((location) => location._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 8);
  const availableReportKinds = ["inventory", ...(canManage ? ["pcs", "borrowings", "maintenance"] : []), ...(canAdmin ? ["activity"] : [])] as const;
  const selectedKind = validValue(first(search.kind), availableReportKinds) || "inventory";
  const selectedPeriod = validValue(first(search.period), exportPeriods) || "all";
  const selectedInventoryStatus = validValue(first(search.inventoryStatus), Object.values(ItemStatus));
  const selectedBorrowingState = validValue(first(search.borrowingState), borrowingReportStates) || "all";
  const selectedFrom = first(search.from)?.slice(0, 10) ?? "";
  const selectedTo = first(search.to)?.slice(0, 10) ?? "";
  const pcOnly = first(search.pcOnly) === "1";

  return (
    <div className="page reports-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Reports</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Inventory overview</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">Use the live summaries and filtered exports for planning, accountability, and department reporting.</p>
          </div>
          <div className="flex flex-wrap gap-3"><a href="/dashboard/reports/export/pdf" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Download overview PDF</a>{canManage ? <><a href="/dashboard/reports/export/pdf?kind=pcs" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">PC register PDF</a><Link href="/dashboard/reports?kind=borrowings" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Lending reports</Link></> : null}</div>
        </header>

        <section className={`grid gap-4 sm:grid-cols-2 ${canManage ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Inventory records</p><p className="mt-3 text-3xl font-semibold">{itemCount.toLocaleString()}</p></article>
          {canManage ? <>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Recorded acquisition value</p><p className="mt-3 text-3xl font-semibold">{displayPurchasePrice(acquisitionSummary._sum.purchasePrice)}</p><p className="muted mt-2 text-sm">{acquisitionSummary._count.purchasePrice.toLocaleString()} priced record{acquisitionSummary._count.purchasePrice === 1 ? "" : "s"}</p></article>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Needs attention</p><p className="mt-3 text-3xl font-semibold">{openTicketCount}</p><Link href="/dashboard/maintenance" className="accent-link mt-3 inline-block text-sm font-semibold">View requests</Link></article>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Currently borrowed</p><p className="mt-3 text-3xl font-semibold">{activeBorrowCount}</p><p className="muted mt-2 text-sm">{overdueBorrowCount} overdue</p></article>
          </> : null}
        </section>

        <section className="card rounded-lg p-5 sm:p-6" aria-labelledby="filtered-export-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Filtered exports</p>
              <h2 id="filtered-export-heading" className="mt-1 text-lg font-semibold">Create a focused operational export</h2>
              <p className="muted mt-1 max-w-3xl text-sm leading-6">Use a timeframe or custom dates, then download the same filtered result as CSV or a presentation-ready PDF. Inventory dates use record creation, borrowing dates use request submission, and audit dates use the recorded event time.</p>
            </div>
            {canAdmin ? <Link href="/dashboard/activity" className="accent-link text-sm font-semibold">Open audit trail</Link> : null}
          </div>
          <form action="/dashboard/reports/export" method="get" className="reports-export-form mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Export data</span>
              <select name="kind" defaultValue={selectedKind} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                <option value="inventory">Inventory records</option>
                {canManage ? <><option value="pcs">PC / Mac register</option><option value="borrowings">Borrowed &amp; returned items</option><option value="maintenance">Service requests</option></> : null}
                {canAdmin ? <option value="activity">Audit trail</option> : null}
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Timeframe</span>
              <select name="period" defaultValue={selectedPeriod} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                {exportPeriods.map((period) => <option key={period} value={period}>{periodLabel(period)}</option>)}
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Start date</span>
              <input type="date" name="from" defaultValue={selectedFrom} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">End date</span>
              <input type="date" name="to" defaultValue={selectedTo} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Inventory status</span>
              <select name="inventoryStatus" defaultValue={selectedInventoryStatus} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                <option value="">All statuses</option>
                {Object.values(ItemStatus).map((status) => <option key={status} value={status}>{inventoryStatusLabel(status)}</option>)}
              </select>
            </label>
            {canManage ? <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Lending report view</span>
              <select name="borrowingState" defaultValue={selectedBorrowingState} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                {borrowingReportStates.map((state) => <option key={state} value={state}>{borrowingStateLabel(state)}</option>)}
              </select>
            </label> : null}
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-sm font-semibold">
              <input name="pcOnly" type="checkbox" value="1" defaultChecked={pcOnly} className="h-4 w-4" />
              PCs only
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="submit" formAction="/dashboard/reports/export" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Download CSV</button>
              <button type="submit" formAction="/dashboard/reports/export/pdf" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Download PDF</button>
              <Link href="/dashboard/reports" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Clear</Link>
            </div>
          </form>
          {canManage ? <div className="reports-lending-shortcuts mt-5" aria-label="Lending report shortcuts">
            <div><p className="text-sm font-semibold">Lending-ready exports</p><p className="muted mt-1 text-xs leading-5">Open the report form with a preselected borrowed or returned view, then set any timeframe or custom date range before downloading CSV or PDF.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/dashboard/reports?kind=borrowings&borrowingState=currently-borrowed" className="reports-shortcut rounded-lg px-3 py-2 text-sm font-semibold">Currently borrowed</Link><Link href="/dashboard/reports?kind=borrowings&borrowingState=returned" className="reports-shortcut rounded-lg px-3 py-2 text-sm font-semibold">Returned items</Link></div>
          </div> : null}
          <p className="muted mt-4 text-xs leading-5">Dates apply to every export. Inventory status applies to inventory and PC/Mac exports; PCs-only applies to inventory records; the lending view applies to borrowed and returned items. Borrowed reports use checkout dates, returned reports use completed return dates, and currently borrowed includes requests awaiting a return confirmation. PC/Mac PDFs use one readable profile per device rather than cramming QR and configuration text into a narrow table.</p>
        </section>

        <section className="card rounded-lg p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Status distribution</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.values(ItemStatus).map((status) => <div key={status} className="card-muted flex items-center justify-between rounded-lg px-4 py-3"><span className={`${inventoryStatusClass(status)} rounded-md px-2 py-1 text-xs font-semibold`}>{inventoryStatusLabel(status)}</span><strong>{statusMap.get(status) ?? 0}</strong></div>)}</div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="card rounded-lg p-5 sm:p-6"><h2 className="text-lg font-semibold">Items by category</h2>{populatedCategories.length ? <ul className="mt-4 divide-y">{populatedCategories.map((category) => <li key={category.id} className="flex items-center justify-between py-3 text-sm"><span>{category.name}</span><strong>{category._count.items}</strong></li>)}</ul> : <p className="muted mt-4 text-sm">No categorized inventory records yet.</p>}</article>
          <article className="card rounded-lg p-5 sm:p-6"><h2 className="text-lg font-semibold">Items by location</h2>{populatedLocations.length ? <ul className="mt-4 divide-y">{populatedLocations.map((location) => <li key={location.id} className="flex items-center justify-between py-3 text-sm"><span>{location.name}</span><strong>{location._count.items}</strong></li>)}</ul> : <p className="muted mt-4 text-sm">No location assignments yet.</p>}</article>
        </section>
      </div>
    </div>
  );
}
