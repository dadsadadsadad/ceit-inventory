import Link from "next/link";

import { BorrowStatus, ItemStatus, MaintenanceStatus } from "@prisma/client";

import { canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryStatusClass, inventoryStatusLabel } from "@/lib/inventory-status";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function ReportsPage() {
  const user = await requireInventoryAccess();
  const canManage = canManageInventory(user.role);
  const today = startOfDay();
  const [itemCount, statusCounts, categoryCounts, locationCounts, openTicketCount, activeBorrowCount, overdueBorrowCount] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { items: true } } } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { items: true } } } }),
    canManage ? prisma.maintenanceTicket.count({ where: { status: { not: MaintenanceStatus.RESOLVED } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] }, expectedReturnDate: { lt: today } } }) : Promise.resolve(0),
  ]);
  const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const populatedCategories = categoryCounts.filter((category) => category._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 8);
  const populatedLocations = locationCounts.filter((location) => location._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 8);

  return (
    <div className="page reports-page"><div className="page-inner space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Reports</p><h1 className="title mt-3 text-3xl sm:text-4xl">Inventory overview</h1><p className="muted mt-2 max-w-2xl text-sm leading-6">Use the live summaries for planning, accountability, and department reporting.</p></div><div className="flex flex-wrap gap-3"><a href="/dashboard/reports/export/pdf" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Download overview PDF</a><a href="/dashboard/reports/export?kind=inventory" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Export inventory CSV</a>{canManage ? <a href="/dashboard/reports/export?kind=borrowings" className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Export borrowing CSV</a> : null}</div></header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Inventory records</p><p className="mt-3 text-3xl font-semibold">{itemCount.toLocaleString()}</p></article>{canManage ? <><article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Needs attention</p><p className="mt-3 text-3xl font-semibold">{openTicketCount}</p><Link href="/dashboard/maintenance" className="accent-link mt-3 inline-block text-sm font-semibold">View requests</Link></article><article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Currently borrowed</p><p className="mt-3 text-3xl font-semibold">{activeBorrowCount}</p><p className="muted mt-2 text-sm">{overdueBorrowCount} overdue</p></article></> : null}</section>
      <section className="card rounded-lg p-5 sm:p-6"><h2 className="text-lg font-semibold">Status distribution</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.values(ItemStatus).map((status) => <div key={status} className="card-muted flex items-center justify-between rounded-lg px-4 py-3"><span className={`${inventoryStatusClass(status)} rounded-md px-2 py-1 text-xs font-semibold`}>{inventoryStatusLabel(status)}</span><strong>{statusMap.get(status) ?? 0}</strong></div>)}</div></section>
      <section className="grid gap-6 xl:grid-cols-2"><article className="card rounded-lg p-5 sm:p-6"><h2 className="text-lg font-semibold">Items by category</h2>{populatedCategories.length ? <ul className="mt-4 divide-y">{populatedCategories.map((category) => <li key={category.id} className="flex items-center justify-between py-3 text-sm"><span>{category.name}</span><strong>{category._count.items}</strong></li>)}</ul> : <p className="muted mt-4 text-sm">No categorized inventory records yet.</p>}</article><article className="card rounded-lg p-5 sm:p-6"><h2 className="text-lg font-semibold">Items by location</h2>{populatedLocations.length ? <ul className="mt-4 divide-y">{populatedLocations.map((location) => <li key={location.id} className="flex items-center justify-between py-3 text-sm"><span>{location.name}</span><strong>{location._count.items}</strong></li>)}</ul> : <p className="muted mt-4 text-sm">No location assignments yet.</p>}</article></section>
      {canManage ? <section className="card flex flex-wrap items-center justify-between gap-4 rounded-lg p-5"><div><h2 className="text-lg font-semibold">Operations exports</h2><p className="muted mt-1 text-sm">Download current CSV files for reports, meetings, or an approved local-school backup workflow.</p></div><div className="flex flex-wrap gap-3"><a href="/dashboard/reports/export?kind=maintenance" className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Service requests CSV</a><a href="/dashboard/reports/export?kind=borrowings" className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Borrowing CSV</a></div></section> : null}
    </div></div>
  );
}
