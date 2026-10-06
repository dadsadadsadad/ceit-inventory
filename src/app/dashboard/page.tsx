import Link from "next/link";
import type { Metadata } from "next";
import { after } from "next/server";
import { BorrowStatus, MaintenanceStatus } from "@prisma/client";
import {
  ArrowRight,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  MapPin,
  Package,
  PackageMinus,
  ShieldAlert,
  Undo2,
  Wrench,
} from "lucide-react";
import { InventoryMix } from "@/app/components/inventory-mix";
import { DashboardNoteForm } from "./dashboard-note-form";
import { canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { auditViewWhere } from "@/lib/audit-trail";
import { purgeExpiredBorrowerDataIfDue } from "@/lib/borrower-data-retention";
import { inventoryAttentionWhere } from "@/lib/inventory-attention";
import { dueTodayWhere } from "@/lib/loan-due";
import { formatManilaDate } from "@/lib/manila-date";
import { personName } from "@/lib/person";
import { lowStockWhere, outOfStockWhere } from "@/lib/stock-queries";
import { warrantyWhere } from "@/lib/warranty";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard · CEIT Inventory" };

async function getDashboardData(includeAuditTrail: boolean) {
  const now = new Date();
  const [
    inventory,
    locationCount,
    recentActivity,
    dashboardNote,
    maintenance,
    borrowing,
    overdueLoans,
    attentionCount,
    lowStockCount,
    outOfStockCount,
    warrantyEndingCount,
    dueTodayCount,
  ] = await Promise.all([
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.location.count({ where: { isActive: true } }),
    includeAuditTrail
      ? prisma.inventoryAudit.findMany({
          where: auditViewWhere("important"),
          select: {
            id: true,
            summary: true,
            entityLabel: true,
            createdAt: true,
            item: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    prisma.dashboardNote.findUnique({ where: { scope: "shared-dashboard" } }),
    prisma.maintenanceTicket.count({ where: { status: MaintenanceStatus.OPEN } }),
    prisma.borrowRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: {
        OR: [
          {
            status: {
              in: [BorrowStatus.REQUESTED, BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED],
            },
          },
          { status: BorrowStatus.RESERVED, expectedReturnDate: { gt: now } },
        ],
      },
    }),
    // Equipment that is still out after its agreed return time.
    prisma.borrowRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: {
        status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
        expectedReturnDate: { lt: now },
      },
    }),
    prisma.inventoryItem.count({ where: inventoryAttentionWhere }),
    prisma.inventoryItem.count({ where: lowStockWhere() }),
    prisma.inventoryItem.count({ where: outOfStockWhere() }),
    prisma.inventoryItem.count({ where: warrantyWhere("ending", now) }),
    prisma.borrowRequest.count({ where: dueTodayWhere(now) }),
  ]);
  // Older notes were saved with an email address; show the person's username instead.
  const noteAuthor = dashboardNote?.updatedByName ?? null;
  const noteAuthorName = noteAuthor?.includes("@")
    ? ((await prisma.user.findFirst({ where: { email: noteAuthor }, select: { username: true } }))
        ?.username ?? noteAuthor)
    : personName(noteAuthor);
  const count = (status: BorrowStatus) =>
    borrowing.find((entry) => entry.status === status)?._count._all ?? 0;
  const overdueCount = (status: BorrowStatus) =>
    overdueLoans.find((entry) => entry.status === status)?._count._all ?? 0;
  return {
    statusCounts: inventory.map((entry) => ({ status: entry.status, count: entry._count._all })),
    itemCount: inventory.reduce((total, entry) => total + entry._count._all, 0),
    attentionCount,
    dueTodayCount,
    lowStockCount,
    outOfStockCount,
    warrantyEndingCount,
    locationCount,
    recentActivity,
    dashboardNote,
    noteAuthorName,
    openTicketCount: maintenance,
    pendingBorrowCount: count(BorrowStatus.REQUESTED),
    checkedOutCount: count(BorrowStatus.BORROWED) + count(BorrowStatus.RETURN_REQUESTED),
    reservationCount: count(BorrowStatus.RESERVED),
    returnCount: count(BorrowStatus.RETURN_REQUESTED),
    overdueCount: overdueCount(BorrowStatus.BORROWED) + overdueCount(BorrowStatus.RETURN_REQUESTED),
    // A late loan with a pending return request is already listed under returns to confirm.
    overdueUnreturnedCount: overdueCount(BorrowStatus.BORROWED),
  };
}

export default async function DashboardPage() {
  const user = await requireInventoryAccess();
  after(() => purgeExpiredBorrowerDataIfDue());
  const canManage = canManageInventory(user.role);
  let dashboard: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  try {
    dashboard = await getDashboardData(canManage);
  } catch (error) {
    console.error("Unable to load dashboard", error);
  }
  const waiting = dashboard
    ? dashboard.pendingBorrowCount +
      dashboard.returnCount +
      dashboard.openTicketCount +
      dashboard.overdueUnreturnedCount +
      dashboard.dueTodayCount +
      dashboard.lowStockCount +
      dashboard.warrantyEndingCount
    : 0;
  const queue = dashboard
    ? [
        {
          label: "Borrowing requests",
          detail: "Review and approve equipment requests",
          count: dashboard.pendingBorrowCount,
          href: "/dashboard/borrowing?status=REQUESTED",
          Icon: ClipboardCheck,
        },
        {
          label: "Overdue loans",
          detail: "Equipment still out past its return time",
          count: dashboard.overdueCount,
          href: "/dashboard/borrowing?status=OVERDUE",
          Icon: Clock3,
        },
        {
          label: "Due back today",
          detail: "Remind borrowers before the return time",
          count: dashboard.dueTodayCount,
          href: "/dashboard/borrowing?status=DUE_TODAY",
          Icon: CalendarClock,
        },
        {
          label: "Returns to confirm",
          detail: "Check returned equipment back in",
          count: dashboard.returnCount,
          href: "/dashboard/borrowing?status=RETURN_REQUESTED",
          Icon: Undo2,
        },
        {
          label: "Maintenance requests",
          detail: "Review reported problems and repairs",
          count: dashboard.openTicketCount,
          href: "/dashboard/maintenance?status=OPEN",
          Icon: Wrench,
        },
        {
          label: "Low stock",
          detail: dashboard.outOfStockCount
            ? `${dashboard.outOfStockCount} out of stock. Time to restock`
            : "Stock that is running low",
          count: dashboard.lowStockCount,
          href: "/dashboard/inventory?stock=low",
          Icon: PackageMinus,
        },
        {
          label: "Warranty ending soon",
          detail: "Equipment whose warranty ends within 60 days",
          count: dashboard.warrantyEndingCount,
          href: "/dashboard/inventory?warranty=ending",
          Icon: ShieldAlert,
        },
      ]
    : [];

  return (
    <div className="page dashboard-overview-page">
      <div className="page-inner space-y-6">
        <header className="dashboard-header">
          <div className="overview-intro">
            <p className="eyebrow">Your equipment workspace</p>
            <h1 className="title mt-2">Inventory dashboard</h1>
            <p className="muted mt-3 text-sm">Everything in its place. Ready for what’s next.</p>
          </div>
          <div className="overview-header-actions">
            <Link
              href="/dashboard/inventory"
              className="primary-button overview-browse inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Browse inventory <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </header>
        <div className="overview-dateline">
          <span>At a glance</span>
          <time dateTime={new Date().toISOString()}>
            {formatManilaDate(new Date(), {
              weekday: "short",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>

        {dashboard ? (
          <>
            <section className="overview-metrics" aria-label="Inventory overview">
              <div>
                <span className="metric-symbol" aria-hidden="true">
                  <Package size={20} strokeWidth={1.6} />
                </span>
                <p className="muted text-sm">Inventory records</p>
                <strong>{dashboard.itemCount.toLocaleString()}</strong>
                <span className="metric-detail">Equipment & supplies</span>
              </div>
              <div>
                <span className="metric-symbol" aria-hidden="true">
                  <MapPin size={20} strokeWidth={1.6} />
                </span>
                <p className="muted text-sm">Active locations</p>
                <strong>{dashboard.locationCount.toLocaleString()}</strong>
                <span className="metric-detail">Rooms, labs & storage</span>
              </div>
              <div>
                <span className="metric-symbol" aria-hidden="true">
                  <Wrench size={20} strokeWidth={1.6} />
                </span>
                <p className="muted text-sm">Needs attention</p>
                <strong
                  className={dashboard.attentionCount ? "text-[var(--status-critical)]" : undefined}
                >
                  {dashboard.attentionCount.toLocaleString()}
                </strong>
                <span className="metric-detail">
                  <Link href="/dashboard/inventory?attention=1">
                    Defective, untested, or poor condition
                  </Link>
                </span>
              </div>
              <div>
                <span className="metric-symbol" aria-hidden="true">
                  <PackageMinus size={20} strokeWidth={1.6} />
                </span>
                <p className="muted text-sm">Low stock</p>
                <strong
                  className={dashboard.lowStockCount ? "text-[var(--status-critical)]" : undefined}
                >
                  {dashboard.lowStockCount.toLocaleString()}
                </strong>
                <span className="metric-detail">
                  <Link href="/dashboard/inventory?stock=low">
                    {dashboard.outOfStockCount
                      ? `${dashboard.outOfStockCount} out of stock`
                      : "Stock at or below its alert level"}
                  </Link>
                </span>
              </div>
            </section>

            <InventoryMix counts={dashboard.statusCounts} />

            <section className={`overview-workspace ${canManage ? "has-queue" : ""}`}>
              {canManage ? (
                <article className="card work-queue rounded-lg">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">The worklist</p>
                      <h2 className="mt-1">Needs a look</h2>
                    </div>
                    <span className={`queue-total ${waiting ? "has-work" : ""}`}>
                      {waiting ? `${waiting} to review` : "Up to date"}
                    </span>
                  </div>
                  {waiting === 0 ? (
                    <p className="queue-clear">
                      <CheckCheck size={18} aria-hidden="true" /> All caught up. New requests will
                      appear here.
                    </p>
                  ) : null}
                  <div className="queue-list">
                    {queue.map(({ label, detail, count, href, Icon }) => (
                      <Link key={href} href={href} className="queue-row">
                        <span className="queue-icon" aria-hidden="true">
                          <Icon size={20} strokeWidth={1.7} />
                        </span>
                        <span className="queue-copy">
                          <strong>{label}</strong>
                          <small>{detail}</small>
                        </span>
                        <b className={count ? "has-work" : ""}>{count}</b>
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                  <div className="queue-footnote">
                    <span>
                      <strong>{dashboard.checkedOutCount}</strong> currently on loan
                    </span>
                    <span>
                      <strong>{dashboard.reservationCount}</strong> upcoming reservations
                    </span>
                  </div>
                </article>
              ) : null}
              <aside className="card dashboard-note-card rounded-lg p-6">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Team memo</p>
                    <h2 className="mt-1">Department note</h2>
                  </div>
                  <span className="note-corner" aria-hidden="true" />
                </div>
                {canManage ? (
                  <DashboardNoteForm
                    initialContent={dashboard.dashboardNote?.content ?? ""}
                    updatedByName={dashboard.noteAuthorName}
                  />
                ) : (
                  <p className="muted mt-5 whitespace-pre-wrap text-sm">
                    {dashboard.dashboardNote?.content || "No department note yet."}
                  </p>
                )}
              </aside>
              {canManage ? (
                <section
                  className="card activity-ledger rounded-lg"
                  aria-labelledby="recent-activity-heading"
                >
                  <div className="section-heading">
                    <h2 id="recent-activity-heading">Recent activity</h2>
                    <Link href="/dashboard/activity" className="accent-link text-sm font-semibold">
                      View audit trail <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                  {dashboard.recentActivity.length ? (
                    <ol className="activity-timeline">
                      {dashboard.recentActivity.map((event) => (
                        <li
                          key={event.id}
                          className="activity-entry flex items-start justify-between gap-4"
                        >
                          <div>
                            <p className="text-sm font-medium">{event.summary}</p>
                            {event.item ? (
                              <Link
                                href={`/dashboard/inventory/${event.item.id}`}
                                className="muted mt-1 block text-xs hover:text-[var(--accent)]"
                              >
                                {event.item.name}
                              </Link>
                            ) : (
                              <p className="muted mt-1 text-xs">
                                {event.entityLabel ?? "System activity"}
                              </p>
                            )}
                          </div>
                          <time
                            className="activity-time muted shrink-0 text-xs"
                            dateTime={event.createdAt.toISOString()}
                          >
                            {formatManilaDate(event.createdAt, { day: "numeric", month: "short" })}
                            <span>
                              {formatManilaDate(event.createdAt, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </time>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted px-6 pb-6 text-sm">
                      Changes to your inventory will appear here.
                    </p>
                  )}
                </section>
              ) : null}
            </section>
          </>
        ) : (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            The dashboard could not load. Refresh the page to try again.
          </div>
        )}
      </div>
    </div>
  );
}
