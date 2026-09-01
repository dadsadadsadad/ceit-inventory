import Link from "next/link";

import { AuditAction, Prisma } from "@prisma/client";

import {
  auditActionLabel,
  auditActions,
  auditActorLabel,
  auditCategory,
  auditChangedFields,
  auditEventDetail,
  auditMetadataPreview,
  auditTrailSearchParameters,
  auditTrailWhere,
  exportPeriods,
  parseAuditTrailFilters,
  type AuditTrailEvent,
  type AuditTrailFilters,
} from "@/lib/audit-trail";
import { requireAdministrationPageAccess } from "@/lib/inventory-auth";
import { formatManilaDate } from "@/lib/manila-date";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type ActivityEvent = Prisma.InventoryAuditGetPayload<{ include: { item: { select: { assetTag: true; id: true; name: true } } } }>;

const pageSize = 50;

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function safePage(value?: string | string[]) {
  const parsed = Number(first(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function searchParameters(search: SearchParams) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const selected = first(value);
    if (selected) parameters.set(key, selected);
  }
  return parameters;
}

function pageLink(filters: AuditTrailFilters, page: number) {
  const parameters = auditTrailSearchParameters(filters, page);
  const query = parameters.toString();
  return query ? `/dashboard/activity?${query}` : "/dashboard/activity";
}

function paginationEntries(totalPages: number, currentPage: number) {
  const pages = new Set<number>([1, totalPages]);
  if (totalPages <= 9) {
    for (let page = 1; page <= totalPages; page += 1) pages.add(page);
  } else {
    const start = currentPage <= 3 ? 1 : currentPage >= totalPages - 2 ? totalPages - 4 : currentPage - 2;
    const end = currentPage <= 3 ? 5 : currentPage >= totalPages - 2 ? totalPages : currentPage + 2;
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  const sortedPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((left, right) => left - right);
  return sortedPages.flatMap((page, index) => index > 0 && page - sortedPages[index - 1] > 1 ? [null, page] : [page]);
}

function periodLabel(period: (typeof exportPeriods)[number]) {
  const labels: Record<(typeof exportPeriods)[number], string> = {
    all: "All time",
    today: "Today",
    "last-7-days": "Last 7 days",
    "last-30-days": "Last 30 days",
    "this-month": "This month",
    "this-year": "This year",
  };
  return labels[period];
}

function formattedTimestamp(value: Date) {
  return formatManilaDate(value, { dateStyle: "medium", timeStyle: "short" });
}

function eventReference(event: ActivityEvent) {
  return `AUD-${event.id.slice(0, 8).toUpperCase()}`;
}

export default async function AuditTrailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdministrationPageAccess();
  const search = await searchParams;
  const requestedPage = safePage(search.page);
  let filters: AuditTrailFilters;
  let filterError: string | null = null;

  try {
    filters = parseAuditTrailFilters(searchParameters(search));
  } catch (error) {
    filterError = error instanceof Error ? error.message : "One or more audit filters are invalid.";
    filters = parseAuditTrailFilters(new URLSearchParams());
  }

  const where = auditTrailWhere(filters);
  let databaseError = false;
  let totalRecords = 0;
  let currentPage = requestedPage;
  let activity: ActivityEvent[] = [];
  let actionCounts = new Map<AuditAction, number>();

  try {
    const [count, groupedCounts] = await Promise.all([
      prisma.inventoryAudit.count({ where }),
      prisma.inventoryAudit.groupBy({ by: ["action"], where, _count: { _all: true } }),
    ]);
    totalRecords = count;
    actionCounts = new Map(groupedCounts.map((entry) => [entry.action, entry._count._all]));
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    activity = await prisma.inventoryAudit.findMany({
      where,
      include: { item: { select: { assetTag: true, id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
  } catch (error) {
    console.error("Unable to load audit trail", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const updateCount = (actionCounts.get(AuditAction.UPDATED) ?? 0) + (actionCounts.get(AuditAction.MOVED) ?? 0) + (actionCounts.get(AuditAction.STATUS_CHANGED) ?? 0);
  const exportParameters = auditTrailSearchParameters(filters);
  exportParameters.set("kind", "activity");
  const exportHref = `/dashboard/reports/export?${exportParameters.toString()}`;

  return (
    <div className="page activity-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Audit trail</h1>
            <p className="muted mt-2 max-w-3xl text-sm leading-6">Search the complete, time-stamped history of inventory records, borrowing operations, maintenance activity, QR scans, imports, and label printing.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={exportHref} className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Export current results</a>
            <Link href="/dashboard" className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Back to dashboard</Link>
          </div>
        </header>

        <section className="card rounded-lg p-5 sm:p-6" aria-labelledby="audit-filters-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Find an event</p>
              <h2 id="audit-filters-heading" className="mt-1 text-lg font-semibold">Filter the audit history</h2>
              <p className="muted mt-1 text-sm leading-6">Custom dates override the selected timeframe. Search covers the event description, user, item name, and asset tag.</p>
            </div>
            <Link href="/dashboard/activity" className="accent-link text-sm font-semibold">Clear filters</Link>
          </div>
          <form className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end" aria-label="Audit trail filters">
            <label className="sm:col-span-2 xl:col-span-2">
              <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
              <input name="q" defaultValue={filters.query ?? ""} maxLength={120} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Event, user, item, or asset tag" />
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">System action</span>
              <select name="action" defaultValue={filters.action ?? ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                <option value="">All actions</option>
                {auditActions.map((action) => <option key={action} value={action}>{auditActionLabel(action)}</option>)}
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">User</span>
              <input name="actor" defaultValue={filters.actor ?? ""} maxLength={120} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Name or email" />
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Timeframe</span>
              <select name="period" defaultValue={filters.period} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                {exportPeriods.map((period) => <option key={period} value={period}>{periodLabel(period)}</option>)}
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Start date</span>
              <input type="date" name="from" defaultValue={filters.from ?? ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">End date</span>
              <input type="date" name="to" defaultValue={filters.to ?? ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Apply filters</button>
          </form>
        </section>

        {filterError ? <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">{filterError} Showing the unfiltered audit trail instead.</div> : null}

        {!databaseError ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Audit trail summary">
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Matching events</p><p className="mt-3 text-3xl font-semibold">{totalRecords.toLocaleString()}</p><p className="muted mt-2 text-sm">Across the selected filters</p></article>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Record updates</p><p className="mt-3 text-3xl font-semibold">{updateCount.toLocaleString()}</p><p className="muted mt-2 text-sm">Updated, moved, or status changed</p></article>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">QR scans</p><p className="mt-3 text-3xl font-semibold">{(actionCounts.get(AuditAction.SCANNED) ?? 0).toLocaleString()}</p><p className="muted mt-2 text-sm">Staff and public label opens</p></article>
            <article className="card rounded-lg p-5"><p className="muted text-xs font-bold uppercase tracking-wide">Items added</p><p className="mt-3 text-3xl font-semibold">{(actionCounts.get(AuditAction.CREATED) ?? 0).toLocaleString()}</p><p className="muted mt-2 text-sm">Manual and imported records</p></article>
          </section>
        ) : null}

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">The audit trail could not be loaded. Confirm the database connection and try again.</div>
        ) : activity.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">No audit events match these filters. Try a broader search or clear the date range.</div>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="Filtered audit events">
            <div className="divider flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="eyebrow">Recorded events</p><h2 className="mt-1 text-lg font-semibold">Complete audit history</h2></div>
              <p className="muted text-sm">{totalRecords.toLocaleString()} event{totalRecords === 1 ? "" : "s"} · Page {currentPage} of {totalPages}</p>
            </div>
            <ol className="divide-y">
              {activity.map((event) => {
                const details = auditEventDetail(event as AuditTrailEvent);
                const changes = auditChangedFields(event as AuditTrailEvent);
                const metadata = auditMetadataPreview(event as AuditTrailEvent);
                return (
                  <li key={event.id} className="px-5 py-5 sm:px-6">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(12rem,0.72fr)_minmax(12rem,0.78fr)] xl:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><span className="status-pill rounded-md px-2.5 py-1 text-xs font-semibold">{auditCategory(event as AuditTrailEvent)}</span><span className="card-muted rounded-md px-2.5 py-1 text-xs font-semibold">{auditActionLabel(event.action)}</span><code className="muted rounded-md border border-[var(--border)] px-2 py-1 text-[0.7rem]">{eventReference(event)}</code></div>
                        <p className="mt-3 text-sm font-semibold leading-6">{event.summary}</p>
                        {details ? <p className="muted mt-1 text-sm leading-6">{details}</p> : null}
                        {changes.length ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Captured changes">{changes.map((change) => <span key={change.label} className="card-muted max-w-full rounded-md px-2.5 py-1 text-xs"><strong>{change.label}:</strong> <span className="break-all">{change.value}</span></span>)}</div> : null}
                        {metadata !== "{}" ? <details className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">View event metadata</summary><pre className="muted mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{metadata}</pre></details> : null}
                      </div>
                      <div className="text-sm">
                        <p className="muted text-xs font-bold uppercase tracking-wide">Inventory record</p>
                        <Link href={`/dashboard/inventory/${event.item.id}`} className="accent-link mt-1 inline-block break-words font-semibold">{event.item.name}</Link>
                        <p className="muted mt-1 break-all text-xs">{event.item.assetTag ?? "No asset tag"}</p>
                      </div>
                      <div className="text-sm xl:text-right">
                        <p className="muted text-xs font-bold uppercase tracking-wide">Recorded by</p>
                        <p className="mt-1 break-words font-medium">{auditActorLabel(event as AuditTrailEvent)}</p>
                        <p className="muted mt-3 text-xs font-bold uppercase tracking-wide">When</p>
                        <time className="mt-1 block font-medium" dateTime={event.createdAt.toISOString()}>{formattedTimestamp(event.createdAt)}</time>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {totalPages > 1 ? <nav className="divider flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" aria-label="Audit trail pages">
              {currentPage > 1 ? <Link href={pageLink(filters, currentPage - 1)} className="pagination-link px-3 text-sm font-semibold">← Previous</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">← Previous</span>}
              <div className="order-3 flex w-full items-center justify-center gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0" aria-label="Choose audit trail page">
                {paginationEntries(totalPages, currentPage).map((entry, index) => entry === null ? <span key={`gap-${index}`} className="muted px-1 text-sm" aria-hidden="true">…</span> : entry === currentPage ? <span key={entry} className="pagination-current text-sm font-semibold" aria-current="page">{entry}</span> : <Link key={entry} href={pageLink(filters, entry)} className="pagination-link text-sm font-semibold" aria-label={`Go to page ${entry}`}>{entry}</Link>)}
              </div>
              {currentPage < totalPages ? <Link href={pageLink(filters, currentPage + 1)} className="pagination-link px-3 text-sm font-semibold">Next →</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">Next →</span>}
            </nav> : null}
          </section>
        )}
      </div>
    </div>
  );
}
