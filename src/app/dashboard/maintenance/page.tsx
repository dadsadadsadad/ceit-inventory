import Link from "next/link";

import { MaintenancePriority, MaintenanceStatus } from "@prisma/client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

import { createMaintenanceTicket, updateMaintenanceTicket } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { item?: string | string[]; status?: string | string[]; created?: string | string[] };

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: MaintenanceStatus) {
  if (status === MaintenanceStatus.OPEN) return "Needs attention";
  return status.toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function priorityLabel(priority: MaintenancePriority) {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function ticketTone(status: MaintenanceStatus) {
  if (status === MaintenanceStatus.RESOLVED) return "status-pill status-pill-positive";
  return "status-pill status-pill-pending";
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWriteAccess();
  const search = await searchParams;
  const requestedStatus = first(search.status);
  const status = Object.values(MaintenanceStatus).includes(requestedStatus as MaintenanceStatus) ? requestedStatus as MaintenanceStatus : undefined;
  const selectedItem = first(search.item);
  const [items, users, tickets] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { status: { not: "RETIRED" } }, orderBy: [{ name: "asc" }, { assetTag: "asc" }], select: { id: true, name: true, assetTag: true }, take: 2_000 }),
    prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMINISTRATOR", "CUSTODIAN", "STAFF"] } }, orderBy: { email: "asc" }, select: { email: true } }),
    prisma.maintenanceTicket.findMany({ where: status ? { status } : undefined, include: { inventoryItem: { select: { id: true, name: true, assetTag: true } } }, orderBy: [{ status: "asc" }, { priority: "desc" }, { openedAt: "desc" }] }),
  ]);

  return (
    <div className="page"><div className="page-inner space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Maintenance</p><h1 className="title mt-3 text-3xl sm:text-4xl">Service requests</h1><p className="muted mt-2 max-w-2xl text-sm leading-6">Report, assign, and resolve repairs without losing the equipment&apos;s inventory history.</p></div><Link href="/dashboard/inventory" className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">View inventory</Link></header>
      {first(search.created) === "1" ? <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">Service request reported.</div> : null}
      <FeedbackForm action={createMaintenanceTicket} className="card space-y-4 rounded-lg p-5 sm:p-6"><div><h2 className="text-lg font-semibold">Report an item issue</h2><p className="muted mt-1 text-sm">Use this when an item needs inspection, repair, or replacement.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="sm:col-span-2"><span className="text-sm font-semibold">Inventory item *</span><select required name="itemId" defaultValue={items.some((item) => item.id === selectedItem) ? selectedItem : ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"><option value="" disabled>Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.assetTag ? ` · ${item.assetTag}` : ""}</option>)}</select></label><label><span className="text-sm font-semibold">Priority</span><select name="priority" defaultValue={MaintenancePriority.NORMAL} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">{Object.values(MaintenancePriority).map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}</select></label><label><span className="text-sm font-semibold">Assign to</span><select name="assignedToName" defaultValue="" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"><option value="">Unassigned</option>{users.map((user) => <option key={user.email} value={user.email}>{user.email}</option>)}</select></label></div><label className="block"><span className="text-sm font-semibold">Issue title *</span><input required name="title" maxLength={255} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Screen does not power on" /></label><label className="block"><span className="text-sm font-semibold">Description *</span><textarea required name="description" rows={4} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Describe the fault, damage, or work needed." /></label><label className="flex items-center gap-3 text-sm"><input name="markDefective" type="checkbox" className="h-4 w-4" /><span>Mark the item as defective while this request needs attention.</span></label><SubmitButton pendingLabel="Reporting…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Report issue</SubmitButton></FeedbackForm>
      <form className="card flex flex-wrap items-end gap-3 rounded-lg p-4"><label><span className="muted text-xs font-bold uppercase tracking-wide">Ticket status</span><select name="status" defaultValue={status ?? ""} className="field mt-2 rounded-lg px-3 py-2.5 text-sm"><option value="">All tickets</option>{Object.values(MaintenanceStatus).map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Filter</button><Link href="/dashboard/maintenance" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Clear</Link></form>
      <section className="space-y-4" aria-label="Service requests">{tickets.length ? tickets.map((ticket) => <article key={ticket.id} className="card rounded-lg p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`${ticketTone(ticket.status)} rounded-md px-2.5 py-1 text-xs font-semibold`}>{statusLabel(ticket.status)}</span><span className="card-muted rounded-md px-2.5 py-1 text-xs font-semibold">{priorityLabel(ticket.priority)} priority</span></div><h2 className="mt-3 text-lg font-semibold">{ticket.title}</h2><Link href={`/dashboard/inventory/${ticket.inventoryItem.id}`} className="accent-link mt-1 inline-block text-sm font-semibold">{ticket.inventoryItem.name}{ticket.inventoryItem.assetTag ? ` · ${ticket.inventoryItem.assetTag}` : ""}</Link><p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6">{ticket.description}</p><p className="muted mt-3 text-xs">Reported {formatDate(ticket.openedAt)} by {ticket.reportedByName ?? "Staff"}</p></div><FeedbackForm action={updateMaintenanceTicket} className="w-full space-y-3 lg:max-w-md"><input type="hidden" name="ticketId" value={ticket.id} /><label className="block text-sm"><span className="font-semibold">Status</span><select name="status" defaultValue={ticket.status} className="field mt-2 w-full rounded-lg px-3 py-2.5"><option value={MaintenanceStatus.OPEN}>Needs attention</option><option value={MaintenanceStatus.RESOLVED}>Resolved</option></select></label><label className="block text-sm"><span className="font-semibold">Assign to</span><select name="assignedToName" defaultValue={ticket.assignedToName ?? ""} className="field mt-2 w-full rounded-lg px-3 py-2.5"><option value="">Unassigned</option>{users.map((user) => <option key={user.email} value={user.email}>{user.email}</option>)}</select></label><label className="block text-sm"><span className="font-semibold">Resolution / staff notes</span><textarea name="resolutionNotes" rows={3} defaultValue={ticket.resolutionNotes ?? ""} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5" /></label><SubmitButton pendingLabel="Saving…" className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Save request</SubmitButton></FeedbackForm></div></article>) : <div className="notice rounded-lg px-5 py-4 text-sm">No service requests match this filter.</div>}</section>
    </div></div>
  );
}
