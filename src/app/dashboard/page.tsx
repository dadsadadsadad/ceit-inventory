import Link from "next/link";
import type { Metadata } from "next";
import { after } from "next/server";
import {
  BorrowStatus,
  ItemCondition,
  ItemStatus,
  ItemType,
  MaintenancePriority,
  MaintenanceStatus,
} from "@prisma/client";
import { ArrowRight, LayoutGrid } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { BrandMark } from "@/app/components/brand-mark";
import { DashboardCalendar } from "./dashboard-calendar";
import { Bars, Columns, Donut } from "./dashboard-charts";
import { DashboardClock } from "./dashboard-clock";
import { DashboardNoteForm } from "./dashboard-note-form";
import { canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { auditSubjectLabel, auditViewWhere } from "@/lib/audit-trail";
import { layoutFor, widgetSpan, type WidgetId } from "@/lib/dashboard-layout";
import { borrowableInventoryStatuses } from "@/lib/borrow-availability";
import { purgeExpiredBorrowerDataIfDue } from "@/lib/borrower-data-retention";
import {
  inspectionIntervalDays,
  inventoryAttentionWhere,
  overdueInspectionWhere,
  pcReplacementYears,
  replacementDueWhere,
} from "@/lib/inventory-attention";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { dueTodayWhere } from "@/lib/loan-due";
import { loadCalendarMonth } from "@/lib/calendar-queries";
import { formatManilaDate, manilaCalendarDate, manilaHour } from "@/lib/manila-date";
import { personName } from "@/lib/person";
import { recentMonths } from "@/lib/reports/charts";
import { namedItemCounts } from "@/lib/reports/builders/shared";
import { formatPesoShort } from "@/lib/reports/format";
import { lowStockWhere, outOfStockWhere } from "@/lib/stock-queries";
import { warrantyWhere } from "@/lib/warranty";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard · CEIT Inventory" };

type Tone = "critical" | "pending" | "positive" | "deployed" | "retired";
type GlanceRow = { label: string; count: number; href: string; tone: Tone };
type Breakdown = { id: string; name: string; count: number }[];

const inService = { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } };
const dayMs = 24 * 60 * 60 * 1000;
const shownGroups = 5;

const statusOrder: ItemStatus[] = [
  "OK",
  "WORKING",
  "DEPLOYED",
  "NOT_TESTED",
  "DEFECTIVE",
  "LOST",
  "RETIRED",
];

function breakdown(
  names: { id: string; name: string }[],
  groups: { count: number; id: string | null }[],
): Breakdown {
  return groups
    .filter((group): group is { count: number; id: string } => Boolean(group.id && group.count))
    .map((group) => ({
      id: group.id,
      name: names.find((entry) => entry.id === group.id)?.name ?? "Inactive",
      count: group.count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function getDashboardData(extras: Set<WidgetId>) {
  const now = new Date();
  const months = recentMonths(now, 6);
  const [
    inventory,
    locations,
    categories,
    byLocation,
    byCategory,
    value,
    readyToLend,
    dashboardNote,
    openByPriority,
    borrowing,
    overdueLoans,
    attentionCount,
    poorConditionCount,
    uncheckedCount,
    replacementCount,
    lowStockCount,
    outOfStockCount,
    warrantyEndingCount,
    dueTodayCount,
    requestDates,
    recentActivity,
    topBorrowed,
    pcDates,
    fixedTickets,
  ] = await Promise.all([
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.location.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.inventoryItem.groupBy({ by: ["locationId"], _count: { _all: true } }),
    prisma.inventoryItem.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.inventoryItem.aggregate({
      where: { ...inService, purchasePrice: { not: null } },
      _sum: { purchasePrice: true },
    }),
    prisma.inventoryItem.count({
      where: {
        itemType: ItemType.ASSET,
        status: { in: [...borrowableInventoryStatuses] },
        category: { isActive: true },
        location: { isActive: true },
      },
    }),
    prisma.dashboardNote.findUnique({ where: { scope: "shared-dashboard" } }),
    prisma.maintenanceTicket.groupBy({
      by: ["priority"],
      where: { status: MaintenanceStatus.OPEN },
      _count: { _all: true },
    }),
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
    prisma.borrowRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: {
        status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
        expectedReturnDate: { lt: now },
      },
    }),
    prisma.inventoryItem.count({ where: inventoryAttentionWhere }),
    prisma.inventoryItem.count({
      where: { ...inService, condition: { in: [ItemCondition.POOR, ItemCondition.FOR_REPAIR] } },
    }),
    prisma.inventoryItem.count({ where: overdueInspectionWhere(now) }),
    prisma.inventoryItem.count({ where: replacementDueWhere(now) }),
    prisma.inventoryItem.count({ where: lowStockWhere() }),
    prisma.inventoryItem.count({ where: outOfStockWhere() }),
    prisma.inventoryItem.count({ where: warrantyWhere("ending", now) }),
    prisma.borrowRequest.count({ where: dueTodayWhere(now) }),
    prisma.borrowRequest.findMany({
      where: { requestedAt: { gte: months[0].start } },
      select: { requestedAt: true },
    }),
    extras.has("activity")
      ? prisma.inventoryAudit.findMany({
          where: auditViewWhere("important"),
          select: {
            id: true,
            summary: true,
            entityLabel: true,
            entityType: true,
            createdAt: true,
            item: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
    extras.has("mostBorrowed")
      ? prisma.borrowRequest
          .groupBy({
            by: ["inventoryItemId"],
            where: {
              status: {
                in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED, BorrowStatus.RETURNED],
              },
              requestedAt: { gte: new Date(now.getTime() - 90 * dayMs) },
            },
            _count: { _all: true },
            orderBy: { _count: { inventoryItemId: "desc" } },
            take: 5,
          })
          .then((groups) =>
            namedItemCounts(
              groups.map((group) => ({
                inventoryItemId: group.inventoryItemId,
                count: group._count._all,
              })),
            ),
          )
      : Promise.resolve([]),
    extras.has("pcAge")
      ? prisma.inventoryItem.findMany({
          where: { isComputer: true, ...inService },
          select: { purchaseDate: true },
        })
      : Promise.resolve([]),
    extras.has("repairs")
      ? prisma.maintenanceTicket.findMany({
          where: { resolvedAt: { gte: new Date(now.getTime() - 90 * dayMs) } },
          select: { openedAt: true, resolvedAt: true },
        })
      : Promise.resolve([]),
  ]);
  // old notes saved the email, show the username
  const noteAuthor = dashboardNote?.updatedByName ?? null;
  const noteAuthorName = noteAuthor?.includes("@")
    ? ((await prisma.user.findFirst({ where: { email: noteAuthor }, select: { username: true } }))
        ?.username ?? noteAuthor)
    : personName(noteAuthor);
  const count = (status: BorrowStatus) =>
    borrowing.find((entry) => entry.status === status)?._count._all ?? 0;
  const overdueCount = (status: BorrowStatus) =>
    overdueLoans.find((entry) => entry.status === status)?._count._all ?? 0;
  const statusCount = (status: ItemStatus) =>
    inventory.find((entry) => entry.status === status)?._count._all ?? 0;

  return {
    statusCounts: statusOrder.map((status) => ({ status, count: statusCount(status) })),
    itemCount: inventory.reduce((total, entry) => total + entry._count._all, 0),
    totalValue: Number(value._sum.purchasePrice ?? 0),
    readyToLend,
    byLocation: breakdown(
      locations,
      byLocation.map((entry) => ({ id: entry.locationId, count: entry._count._all })),
    ),
    byCategory: breakdown(
      categories,
      byCategory.map((entry) => ({ id: entry.categoryId, count: entry._count._all })),
    ),
    defectiveCount: statusCount(ItemStatus.DEFECTIVE),
    notTestedCount: statusCount(ItemStatus.NOT_TESTED),
    poorConditionCount,
    uncheckedCount,
    replacementCount,
    attentionCount,
    dueTodayCount,
    lowStockCount,
    outOfStockCount,
    warrantyEndingCount,
    dashboardNote,
    noteAuthorName,
    openTicketCount: openByPriority.reduce((sum, entry) => sum + entry._count._all, 0),
    urgentTicketCount: openByPriority
      .filter((entry) => entry.priority === MaintenancePriority.URGENT)
      .reduce((sum, entry) => sum + entry._count._all, 0),
    requestsPerMonth: months.map((month) => ({
      label: month.label,
      value: requestDates.filter(
        (request) => request.requestedAt >= month.start && request.requestedAt < month.end,
      ).length,
    })),
    recentActivity,
    topBorrowed,
    pcAges: [
      { label: "Under 2 years", min: 0, max: 2 },
      { label: "2 to 4 years", min: 2, max: 4 },
      { label: `4 to ${pcReplacementYears} years`, min: 4, max: pcReplacementYears },
      { label: `${pcReplacementYears}+ years`, min: pcReplacementYears, max: Infinity },
    ].map((bucket) => ({
      label: bucket.label,
      value: pcDates.filter((pc) => {
        const years = pc.purchaseDate
          ? (now.getTime() - pc.purchaseDate.getTime()) / (365.25 * dayMs)
          : -1;
        return years >= bucket.min && years < bucket.max;
      }).length,
    })),
    pcNoDate: pcDates.filter((pc) => !pc.purchaseDate).length,
    fixDays: fixedTickets.length
      ? fixedTickets.reduce(
          (sum, ticket) => sum + (ticket.resolvedAt!.getTime() - ticket.openedAt.getTime()) / dayMs,
          0,
        ) / fixedTickets.length
      : null,
    openByPriority: Object.values(MaintenancePriority)
      .reverse()
      .map((priority) => ({
        priority,
        count: openByPriority.find((entry) => entry.priority === priority)?._count._all ?? 0,
      })),
    pendingBorrowCount: count(BorrowStatus.REQUESTED),
    checkedOutCount: count(BorrowStatus.BORROWED) + count(BorrowStatus.RETURN_REQUESTED),
    reservationCount: count(BorrowStatus.RESERVED),
    returnCount: count(BorrowStatus.RETURN_REQUESTED),
    overdueCount: overdueCount(BorrowStatus.BORROWED) + overdueCount(BorrowStatus.RETURN_REQUESTED),
  };
}

function GlanceList({ rows }: { rows: GlanceRow[] }) {
  return (
    <ul className="glance-list">
      {rows.map(({ label, count, href, tone }) => (
        <li key={label}>
          <Link href={href} className="glance-row" data-tone={count ? tone : undefined}>
            <span className="glance-dot" aria-hidden="true" />
            <span className="glance-label">{label}</span>
            <b>{count.toLocaleString()}</b>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Metric({
  href,
  label,
  value,
  detail,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
}) {
  return (
    <Link href={href} data-tone={tone}>
      <p className="muted text-sm">{label}</p>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </Link>
  );
}

function GroupCard({
  title,
  entries,
  param,
  noun,
}: {
  title: string;
  entries: Breakdown;
  param: string;
  noun: [string, string];
}) {
  const more = entries.length - shownGroups;
  return (
    <article className="card glance-card rounded-lg">
      <div className="section-heading">
        <h2>{title}</h2>
        {more > 0 ? (
          <Link href="/dashboard/inventory/setup" className="accent-link text-sm font-semibold">
            {more} more {more === 1 ? noun[0] : noun[1]}
          </Link>
        ) : null}
      </div>
      <Bars
        unit="items"
        empty="Nothing recorded yet."
        bars={entries.slice(0, shownGroups).map((entry) => ({
          id: entry.id,
          label: entry.name,
          value: entry.count,
          href: `/dashboard/inventory?${param}=${entry.id}`,
        }))}
      />
    </article>
  );
}

export default async function DashboardPage() {
  const user = await requireInventoryAccess();
  after(() => purgeExpiredBorrowerDataIfDue());
  const canManage = canManageInventory(user.role);
  const today = manilaCalendarDate();
  const calendarMonth = today.slice(0, 7);
  // calendar failing shouldn't break the dashboard
  const calendarEntries = loadCalendarMonth(calendarMonth).catch((error) => {
    console.error("Unable to load the calendar", error);
    return [];
  });
  const saved = await prisma.user.findUnique({
    where: { id: user.id },
    select: { dashboardLayout: true },
  });
  const layout = layoutFor(saved?.dashboardLayout, canManage).filter((widget) => widget.visible);
  const shown = new Set(layout.map((widget) => widget.id));
  let dashboard: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  try {
    dashboard = await getDashboardData(shown);
  } catch (error) {
    console.error("Unable to load dashboard", error);
  }

  const hour = manilaHour();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!dashboard) {
    return (
      <div className="page dashboard-overview-page">
        <div className="page-inner space-y-4">
          <h1 className="title">Inventory dashboard</h1>
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            Couldn&apos;t load the dashboard. Refresh to try again.
          </div>
        </div>
      </div>
    );
  }

  const attentionRows: GlanceRow[] = [
    {
      label: "Defective",
      count: dashboard.defectiveCount,
      href: "/dashboard/inventory?status=DEFECTIVE",
      tone: "critical",
    },
    {
      label: "Not tested",
      count: dashboard.notTestedCount,
      href: "/dashboard/inventory?status=NOT_TESTED",
      tone: "pending",
    },
    {
      label: "Poor or for repair",
      count: dashboard.poorConditionCount,
      href: "/dashboard/inventory?attention=1",
      tone: "pending",
    },
    {
      label: `PCs ${pcReplacementYears}+ years old`,
      count: dashboard.replacementCount,
      href: "/dashboard/inventory?age=old",
      tone: "pending",
    },
    {
      label: `Not checked in ${inspectionIntervalDays}+ days`,
      count: dashboard.uncheckedCount,
      href: "/dashboard/inventory?checked=overdue",
      tone: "retired",
    },
    {
      label: "Warranty ending soon",
      count: dashboard.warrantyEndingCount,
      href: "/dashboard/inventory?warranty=ending",
      tone: "pending",
    },
    {
      label: "Low stock",
      count: dashboard.lowStockCount,
      href: "/dashboard/inventory?stock=low",
      tone: "pending",
    },
    {
      label: "Out of stock",
      count: dashboard.outOfStockCount,
      href: "/dashboard/inventory?stock=out",
      tone: "critical",
    },
  ];
  const borrowingRows: GlanceRow[] = [
    {
      label: "Requests to review",
      count: dashboard.pendingBorrowCount,
      href: "/dashboard/borrowing?status=REQUESTED",
      tone: "pending",
    },
    {
      label: "Overdue",
      count: dashboard.overdueCount,
      href: "/dashboard/borrowing?status=OVERDUE",
      tone: "critical",
    },
    {
      label: "Due back today",
      count: dashboard.dueTodayCount,
      href: "/dashboard/borrowing?status=DUE_TODAY",
      tone: "pending",
    },
    {
      label: "Returns to confirm",
      count: dashboard.returnCount,
      href: "/dashboard/borrowing?status=RETURN_REQUESTED",
      tone: "pending",
    },
    {
      label: "Reservations",
      count: dashboard.reservationCount,
      href: "/dashboard/borrowing?status=RESERVED",
      tone: "positive",
    },
  ];
  const waiting =
    dashboard.attentionCount +
    (canManage
      ? dashboard.pendingBorrowCount +
        dashboard.returnCount +
        dashboard.overdueCount +
        dashboard.openTicketCount
      : 0);
  const widgets: Record<WidgetId, ReactNode> = {
    metrics: (
      <section
        className={`overview-metrics ${canManage ? "is-manager" : ""}`}
        aria-label="Inventory overview"
      >
        <Metric
          href="/dashboard/inventory"
          label="Records"
          value={dashboard.itemCount.toLocaleString()}
          detail={
            dashboard.totalValue
              ? `${formatPesoShort(dashboard.totalValue)} worth`
              : `${dashboard.byCategory.length} ${dashboard.byCategory.length === 1 ? "category" : "categories"}`
          }
        />
        <Metric
          href="/dashboard/inventory?itemType=ASSET"
          label="Ready to lend"
          value={dashboard.readyToLend.toLocaleString()}
          detail="Working, not out"
        />
        {canManage ? (
          <Metric
            href="/dashboard/borrowing?status=BORROWED"
            label="On loan"
            value={dashboard.checkedOutCount.toLocaleString()}
            detail={dashboard.overdueCount ? `${dashboard.overdueCount} overdue` : "None overdue"}
            tone={dashboard.overdueCount ? "critical" : undefined}
          />
        ) : null}
        {canManage ? (
          <Metric
            href="/dashboard/maintenance?status=OPEN"
            label="Open repairs"
            value={dashboard.openTicketCount.toLocaleString()}
            detail={
              dashboard.urgentTicketCount ? `${dashboard.urgentTicketCount} urgent` : "None urgent"
            }
            tone={dashboard.urgentTicketCount ? "critical" : undefined}
          />
        ) : null}
        <Metric
          href="/dashboard/inventory?attention=1"
          label="Needs attention"
          value={dashboard.attentionCount.toLocaleString()}
          detail="Items to check"
          tone={dashboard.attentionCount ? "critical" : undefined}
        />
      </section>
    ),
    status: (
      <section className="card glance-card rounded-lg" aria-labelledby="status-heading">
        <div className="section-heading">
          <h2 id="status-heading">Inventory status</h2>
        </div>
        <Donut
          unit="records"
          segments={dashboard.statusCounts.map(({ status, count }) => ({
            label: inventoryStatusLabel(status),
            value: count,
            color: `var(--mix-${status.toLowerCase()})`,
            href: `/dashboard/inventory?status=${status}`,
          }))}
        />
      </section>
    ),
    borrowing: (
      <article className="card glance-card rounded-lg">
        <div className="section-heading">
          <h2>Borrowing</h2>
          <Link href="/dashboard/borrowing" className="accent-link text-sm font-semibold">
            View all
          </Link>
        </div>
        <GlanceList rows={borrowingRows} />
        <p className="viz-caption">Requests per month</p>
        <Columns unit="requests" data={dashboard.requestsPerMonth} />
      </article>
    ),
    attention: (
      <article className="card glance-card rounded-lg">
        <div className="section-heading">
          <h2>Needs attention</h2>
          <Link
            href="/dashboard/inventory?attention=1"
            className="accent-link text-sm font-semibold"
          >
            View
          </Link>
        </div>
        <GlanceList rows={attentionRows} />
      </article>
    ),
    byCategory: (
      <GroupCard
        title="Items by category"
        entries={dashboard.byCategory}
        param="category"
        noun={["category", "categories"]}
      />
    ),
    byRoom: (
      <GroupCard
        title="Items by room"
        entries={dashboard.byLocation}
        param="location"
        noun={["room", "rooms"]}
      />
    ),
    repairs: (
      <article className="card glance-card rounded-lg">
        <div className="section-heading">
          <h2>Repairs</h2>
          <Link href="/dashboard/maintenance" className="accent-link text-sm font-semibold">
            View all
          </Link>
        </div>
        <GlanceList
          rows={dashboard.openByPriority.map(({ priority, count }) => ({
            label: `${priority.charAt(0)}${priority.slice(1).toLowerCase()} priority`,
            count,
            href: "/dashboard/maintenance?status=OPEN",
            tone: priority === "URGENT" || priority === "HIGH" ? "critical" : "pending",
          }))}
        />
        <p className="viz-caption">
          {dashboard.fixDays === null
            ? "Nothing fixed in the last 90 days."
            : `Fixed in ${dashboard.fixDays < 1 ? "under a day" : `${dashboard.fixDays.toFixed(1)} days`} on average (90 days).`}
        </p>
      </article>
    ),
    mostBorrowed: (
      <article className="card glance-card rounded-lg">
        <div className="section-heading">
          <h2>Most borrowed</h2>
          <span className="muted text-sm">90 days</span>
        </div>
        <Bars
          unit="loans"
          empty="Nothing borrowed lately."
          bars={dashboard.topBorrowed.map(([label, value]) => ({
            id: label,
            label,
            value,
            href: `/dashboard/borrowing?q=${encodeURIComponent(label)}`,
          }))}
        />
      </article>
    ),
    pcAge: (
      <article className="card glance-card rounded-lg">
        <div className="section-heading">
          <h2>PC age</h2>
          <Link href="/dashboard/inventory?age=old" className="accent-link text-sm font-semibold">
            Due to replace
          </Link>
        </div>
        <Bars
          unit="PCs"
          empty="No PCs recorded yet."
          bars={dashboard.pcAges.map((bucket, index) => ({
            id: bucket.label,
            label: bucket.label,
            value: bucket.value,
            href:
              index === dashboard.pcAges.length - 1
                ? "/dashboard/inventory?age=old"
                : "/dashboard/inventory/hardware?view=pcs",
          }))}
        />
        {dashboard.pcNoDate ? (
          <p className="viz-caption">{dashboard.pcNoDate} PCs have no purchase date.</p>
        ) : null}
      </article>
    ),
    calendar: (
      <DashboardCalendar
        canEdit={canManage}
        initialEntries={await calendarEntries}
        initialMonth={calendarMonth}
        today={today}
      />
    ),
    note: (
      <div className="card dashboard-note-card rounded-lg">
        <div className="section-heading">
          <h2>Department note</h2>
          <span className="note-corner" aria-hidden="true" />
        </div>
        {canManage ? (
          <DashboardNoteForm
            initialContent={dashboard.dashboardNote?.content ?? ""}
            updatedByName={dashboard.noteAuthorName}
          />
        ) : (
          <p className="muted mt-2 whitespace-pre-wrap text-sm">
            {dashboard.dashboardNote?.content || "No department note yet."}
          </p>
        )}
      </div>
    ),
    activity: (
      <article className="card glance-card rounded-lg">
        <div className="section-heading">
          <h2>Recent activity</h2>
          <Link href="/dashboard/activity" className="accent-link text-sm font-semibold">
            View all
          </Link>
        </div>
        {dashboard.recentActivity.length ? (
          <ol className="activity-mini">
            {dashboard.recentActivity.map((event) => (
              <li key={event.id}>
                <span>{event.summary}</span>
                <small className="muted">
                  {event.item ? (
                    <Link href={`/dashboard/inventory/${event.item.id}`}>{event.item.name}</Link>
                  ) : (
                    (auditSubjectLabel(event) ?? "Department records")
                  )}
                  {" · "}
                  {formatManilaDate(event.createdAt, {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted text-sm">No activity yet.</p>
        )}
      </article>
    ),
  };
  const main = layout.filter((widget) => widget.zone === "main");
  const side = layout.filter((widget) => widget.zone === "side");

  const standing = waiting
    ? `${waiting.toLocaleString()} ${waiting === 1 ? "thing needs" : "things need"} a look.`
    : "Everything looks good.";

  return (
    <div className="page dashboard-overview-page">
      <div className="page-inner space-y-3">
        <header className="dashboard-header">
          <div className="overview-intro">
            <BrandMark size={48} />
            <div>
              <h1 className="title">Inventory dashboard</h1>
              <p className="overview-greeting muted mt-1">
                {greeting}, <strong>{user.username}</strong>. {standing}
              </p>
            </div>
          </div>
          <div className="overview-header-actions">
            <div className="overview-dateline">
              <DashboardClock initial={new Date().toISOString()} />
              <time dateTime={new Date().toISOString()}>
                {formatManilaDate(new Date(), {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </div>
            <Link
              href="/dashboard/settings#dashboard-layout"
              className="secondary-button overview-browse inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              <LayoutGrid size={16} aria-hidden="true" /> Customize
            </Link>
            <Link
              href="/dashboard/inventory"
              className="primary-button overview-browse inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Browse inventory <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </header>

        {layout.length ? (
          <div className={`dashboard-layout ${side.length && main.length ? "has-rail" : ""}`}>
            {main.length ? (
              <div className="dashboard-cards">
                {main.map((widget) => (
                  <div
                    key={widget.id}
                    className="dashboard-widget"
                    data-widget={widget.id}
                    data-size={widget.size}
                    style={{ "--span": widgetSpan(widget.size) } as CSSProperties}
                  >
                    {widgets[widget.id]}
                  </div>
                ))}
              </div>
            ) : null}
            {side.length ? (
              <aside className="dashboard-rail" aria-label="Side cards">
                {side.map((widget) => (
                  <div key={widget.id} className="dashboard-widget" data-widget={widget.id}>
                    {widgets[widget.id]}
                  </div>
                ))}
              </aside>
            ) : null}
          </div>
        ) : (
          <p className="notice rounded-lg px-5 py-4 text-sm">
            Every card is hidden.{" "}
            <Link href="/dashboard/settings#dashboard-layout" className="accent-link font-semibold">
              Pick some cards
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
