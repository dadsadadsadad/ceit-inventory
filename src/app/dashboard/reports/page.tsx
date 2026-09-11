import Link from "next/link";
import { ReportExportForm } from "./report-export-form";

import { BorrowStatus, ItemStatus, MaintenanceStatus } from "@prisma/client";

import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryStatusClass, inventoryStatusLabel } from "@/lib/inventory-status";
import { borrowingReportStates, exportPeriods } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

type SearchParams = {
  borrowingState?: string | string[];
  borrowingStatus?: string | string[];
  from?: string | string[];
  inventoryStatus?: string | string[];
  kind?: string | string[];
  maintenanceSource?: string | string[];
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

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [user, search] = await Promise.all([requireInventoryAccess(), searchParams]);
  const canManage = canManageInventory(user.role);
  const canAdmin = canManageAdministration(user.role);
  const today = new Date();
  const [itemCount, statusCounts, categoryCounts, locationCounts, openTicketCount, activeBorrowCount, overdueBorrowCount, acquisitionSummary, reservationCount, qrIssueCount] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { items: true } } } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { items: true } } } }),
    canManage ? prisma.maintenanceTicket.count({ where: { status: { not: MaintenanceStatus.RESOLVED } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] }, expectedReturnDate: { lt: today } } }) : Promise.resolve(0),
    canManage ? prisma.inventoryItem.aggregate({ _count: { purchasePrice: true }, _sum: { purchasePrice: true } }) : Promise.resolve({ _count: { purchasePrice: 0 }, _sum: { purchasePrice: null } }),
    prisma.borrowRequest.count({ where: { status: BorrowStatus.RESERVED, expectedReturnDate: { gt: today } } }),
    prisma.maintenanceTicket.count({ where: { source: "QR", status: MaintenanceStatus.OPEN } }),
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
  const maintenanceSource = validValue(first(search.maintenanceSource), ["QR", "STAFF"] as const);

  return (
    <div className="page reports-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Department records</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Reports</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">Review inventory totals and download reports for your department.</p>
          </div>
          <div className="flex flex-wrap gap-3"><a href="/dashboard/reports/export/pdf" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Download overview PDF</a>{canManage ? <><a href="/dashboard/reports/export/pdf?kind=pcs" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">PC register PDF</a><Link href="/dashboard/reports?kind=borrowings" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Borrowing reports</Link></> : null}</div>
        </header>

        <section className={`grid gap-4 sm:grid-cols-2 ${canManage ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Inventory records</p><p className="mt-3 text-3xl font-semibold">{itemCount.toLocaleString()}</p></article>
          {canManage ? <>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Recorded acquisition value</p><p className="mt-3 text-3xl font-semibold">{displayPurchasePrice(acquisitionSummary._sum.purchasePrice)}</p><p className="muted mt-2 text-sm">{acquisitionSummary._count.purchasePrice.toLocaleString()} priced record{acquisitionSummary._count.purchasePrice === 1 ? "" : "s"}</p></article>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Needs attention</p><p className="mt-3 text-3xl font-semibold">{openTicketCount}</p><Link href="/dashboard/maintenance" className="accent-link mt-3 inline-block text-sm font-semibold">View requests</Link></article>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Currently borrowed</p><p className="mt-3 text-3xl font-semibold">{activeBorrowCount}</p><p className="muted mt-2 text-sm">{overdueBorrowCount} overdue</p></article>
          </> : null}
        </section>

        <div className="grid gap-4 sm:grid-cols-2"><Link href="/dashboard/borrowing?status=RESERVED" className="card card-link rounded-lg p-5"><p className="muted text-sm">Upcoming reservations</p><p className="mt-2 text-2xl font-semibold">{reservationCount}</p></Link><Link href="/dashboard/maintenance?source=QR&status=OPEN" className="card card-link rounded-lg p-5"><p className="muted text-sm">Open QR issue reports</p><p className="mt-2 text-2xl font-semibold">{qrIssueCount}</p></Link></div>
        <section className="card rounded-lg p-5 sm:p-6" aria-labelledby="filtered-export-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Filtered exports</p>
              <h2 id="filtered-export-heading" className="mt-1 text-lg font-semibold">Download a report</h2>
              <p className="muted mt-1 max-w-3xl text-sm leading-6">Choose a report and date range, then download a CSV or PDF.</p>
            </div>
            {canAdmin ? <Link href="/dashboard/activity" className="accent-link text-sm font-semibold">Open audit trail</Link> : null}
          </div>
          <ReportExportForm canAdmin={canAdmin} initial={{ kind: selectedKind, period: selectedPeriod, from: selectedFrom, to: selectedTo, inventoryStatus: selectedInventoryStatus, borrowingState: selectedBorrowingState, maintenanceSource, pcOnly }} />
          {canManage ? <div className="reports-lending-shortcuts mt-5" aria-label="Lending report shortcuts">
            <div><p className="text-sm font-semibold">Quick filters</p><p className="muted mt-1 text-xs leading-5">Choose a view, then adjust the dates above.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/dashboard/reports?kind=borrowings&borrowingState=currently-borrowed" className="reports-shortcut rounded-lg px-3 py-2 text-sm font-semibold">Currently borrowed</Link><Link href="/dashboard/reports?kind=borrowings&borrowingState=returned" className="reports-shortcut rounded-lg px-3 py-2 text-sm font-semibold">Returned items</Link><Link href="/dashboard/reports?kind=borrowings&borrowingState=reserved" className="reports-shortcut rounded-lg px-3 py-2 text-sm font-semibold">Reservations</Link><Link href="/dashboard/reports?kind=maintenance&maintenanceSource=QR" className="reports-shortcut rounded-lg px-3 py-2 text-sm font-semibold">QR issues</Link></div>
          </div> : null}
          <p className="muted mt-4 text-xs leading-5">Borrowed reports use checkout dates; returned reports use return dates. Reservation reports use pickup dates, and cancelled reservations use cancellation dates. Other reports use the date the record was created.</p>
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
