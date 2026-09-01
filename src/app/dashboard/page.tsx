import Link from "next/link";

import { BorrowStatus, ItemStatus, MaintenanceStatus } from "@prisma/client";
import { ArrowRight, ArrowUpRight, BarChart3, ClipboardCheck, FileUp, MapPin, Package, PackagePlus, ScanLine, TriangleAlert, Wrench } from "lucide-react";

import { DashboardNoteForm } from "./dashboard-note-form";

import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { formatManilaDate } from "@/lib/manila-date";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

async function getDashboardData(includeAuditTrail: boolean) {
  const [itemCount, locationCount, attentionCount, recentActivity, dashboardNote, openTicketCount, pendingBorrowCount, checkedOutCount] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.location.count({ where: { isActive: true } }),
    prisma.inventoryItem.count({ where: { status: ItemStatus.DEFECTIVE } }),
    includeAuditTrail ? prisma.inventoryAudit.findMany({ include: { item: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }) : Promise.resolve([]),
    prisma.dashboardNote.findUnique({ where: { scope: "shared-dashboard" } }),
    prisma.maintenanceTicket.count({ where: { status: MaintenanceStatus.OPEN } }),
    prisma.borrowRequest.count({ where: { status: BorrowStatus.REQUESTED } }),
    prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] } } }),
  ]);
  return { attentionCount, checkedOutCount, dashboardNote, itemCount, locationCount, openTicketCount, pendingBorrowCount, recentActivity };
}

export default async function DashboardPage() {
  const user = await requireInventoryAccess();
  const canAdmin = canManageAdministration(user.role);
  const canManage = canManageInventory(user.role);
  let dashboard: Awaited<ReturnType<typeof getDashboardData>> | null = null;

  try {
    dashboard = await getDashboardData(canAdmin);
  } catch (error) {
    console.error("Unable to load dashboard", error);
  }

  const cards = dashboard ? [
    { label: "Inventory records", value: dashboard.itemCount.toLocaleString(), detail: "Equipment records", href: "/dashboard/inventory", Icon: Package },
    { label: "Active locations", value: dashboard.locationCount.toLocaleString(), detail: "Rooms, labs, and storage areas", href: "/dashboard/settings", Icon: MapPin },
    { label: "Needs attention", value: dashboard.attentionCount.toLocaleString(), detail: "Defective items", href: "/dashboard/inventory?status=DEFECTIVE", Icon: TriangleAlert },
  ] : [];
  const quickActions = [
    { label: "Scan an item", detail: "Open a label with your camera", href: "/scan", Icon: ScanLine },
    { label: "View reports", detail: "See the current inventory reports", href: "/dashboard/reports", Icon: BarChart3 },
    ...(canManage ? [
      { label: "Add a record", detail: "Register equipment", href: "/dashboard/inventory/new", Icon: PackagePlus },
      { label: "Import a file", detail: "Bring in an existing register", href: "/dashboard/inventory/import", Icon: FileUp },
    ] : []),
  ];

  return (
    <div className="page dashboard-overview-page">
      <div className="page-inner space-y-6">
        <header className="card dashboard-hero rounded-lg px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="dashboard-hero-kicker"><span className="dashboard-kicker-dot" aria-hidden="true" />Live workspace</div>
              <p className="eyebrow mt-4">Overview</p>
              <h1 className="title mt-3 text-3xl sm:text-4xl">Inventory dashboard</h1>
              <p className="muted mt-3 max-w-2xl text-sm leading-6">A live overview of CEIT equipment, supplies, rooms, and records.</p>
            </div>
            <div className={`connection-status ${dashboard ? "connection-status-online" : "connection-status-offline"} rounded-lg px-4 py-3 text-sm font-medium`} role="status">
              {dashboard ? "Database connected" : "Database unavailable"}
            </div>
          </div>
        </header>

        {dashboard ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Inventory overview">
              {cards.map((stat) => (
                <Link key={stat.label} href={stat.href} className="card card-link dashboard-stat-card rounded-lg p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><stat.Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <ArrowUpRight className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
                  </div>
                  <div className="dashboard-stat-number title mt-6">{stat.value}</div>
                  <div className="mt-2 text-sm font-semibold">{stat.label}</div>
                  <p className="muted mt-1 text-sm leading-6">{stat.detail}</p>
                </Link>
              ))}
            </section>

            <section className={`dashboard-command-grid grid gap-5 ${canManage ? "xl:grid-cols-[1.28fr_0.72fr]" : ""}`} aria-label="Inventory workspace shortcuts">
              <article className="card dashboard-command-card rounded-lg p-5 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow">Start here</p>
                    <h2 className="mt-2 text-xl font-semibold">Keep the register moving</h2>
                    <p className="muted mt-2 max-w-xl text-sm leading-6">Jump straight into the tasks your team performs most often.</p>
                  </div>
                  <ClipboardCheck className="dashboard-command-icon h-11 w-11" aria-hidden="true" />
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {quickActions.map((action) => (
                    <Link key={action.label} href={action.href} className="dashboard-quick-action rounded-xl p-4">
                      <span className="dashboard-quick-icon"><action.Icon className="h-5 w-5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{action.label}</span><span className="muted mt-1 block text-xs leading-5">{action.detail}</span></span>
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </article>

              {canManage ? (
                <aside className="card dashboard-pulse-card rounded-lg p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Operations pulse</p><h2 className="mt-2 text-xl font-semibold">Today&apos;s attention</h2></div><span className="dashboard-pulse-signal" aria-label="Live database data" /></div>
                  <div className="mt-6 space-y-3">
                    <Link href="/dashboard/maintenance" className="dashboard-pulse-row"><span className="dashboard-pulse-icon"><Wrench className="h-4 w-4" aria-hidden="true" /></span><span className="flex-1 text-sm font-medium">Open service requests</span><strong>{dashboard.openTicketCount}</strong></Link>
                    <Link href="/dashboard/borrowing?status=REQUESTED" className="dashboard-pulse-row"><span className="dashboard-pulse-icon"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /></span><span className="flex-1 text-sm font-medium">Borrowing requests to review</span><strong>{dashboard.pendingBorrowCount}</strong></Link>
                    <Link href="/dashboard/borrowing?status=BORROWED" className="dashboard-pulse-row"><span className="dashboard-pulse-icon"><Package className="h-4 w-4" aria-hidden="true" /></span><span className="flex-1 text-sm font-medium">Items currently checked out</span><strong>{dashboard.checkedOutCount}</strong></Link>
                  </div>
                </aside>
              ) : null}
            </section>

            <section className={`grid gap-5 ${canAdmin ? "xl:grid-cols-[1.35fr_1fr]" : ""}`}>
              {canAdmin ? <article className="card rounded-lg">
                <div className="divider flex items-center justify-between border-b px-6 py-4"><h2 className="text-base font-semibold">Recent activity</h2><Link href="/dashboard/activity" className="accent-link text-sm font-semibold">See all</Link></div>
                {dashboard.recentActivity.length ? (
                  <ol className="divide-y">
                    {dashboard.recentActivity.map((event) => (
                      <li key={event.id} className="dashboard-activity-item flex items-start justify-between gap-4 px-6 py-4">
                        <div><p className="text-sm font-semibold">{event.summary}</p><Link href={`/dashboard/inventory/${event.item.id}`} className="muted mt-1 block text-xs hover:text-[var(--accent)]">{event.item.name}</Link></div>
                        <time className="muted shrink-0 text-xs" dateTime={event.createdAt.toISOString()}>{formatManilaDate(event.createdAt, { day: "numeric", month: "short" })}</time>
                      </li>
                    ))}
                  </ol>
                ) : <p className="muted px-6 py-8 text-sm">Activity will appear here after your first item is added or imported.</p>}
              </article> : null}

              <aside className="card dashboard-note-card flex min-h-[27rem] flex-col rounded-lg p-6">
                <h2 className="text-base font-semibold">Notes</h2>
                {canManage ? (
                  <DashboardNoteForm initialContent={dashboard.dashboardNote?.content ?? ""} updatedByName={dashboard.dashboardNote?.updatedByName} />
                ) : (
                  <p className="muted mt-5 flex-1 whitespace-pre-wrap text-sm leading-6">{dashboard.dashboardNote?.content || "Add a note here"}</p>
                )}
              </aside>
            </section>
          </>
        ) : <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">The dashboard is temporarily unavailable. Confirm the database connection and refresh this page.</div>}
      </div>
    </div>
  );
}
