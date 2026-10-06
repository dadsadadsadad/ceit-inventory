export const metadata = { title: "Audit trail · CEIT Inventory" };

import { Pager } from "@/app/components/pager";
import {
  auditTrailSearchParameters,
  auditTrailWhere,
  parseAuditTrailFilters,
  type AuditTrailFilters,
} from "@/lib/audit-trail";
import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";
import { firstParam, pageParam, type RawParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { AuditEventList, type ActivityEvent } from "./audit-event-list";
import { AuditFilters } from "./audit-filters";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, RawParam>;

const pageSize = 40;

function searchParameters(search: SearchParams) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const selected = firstParam(value);
    if (selected) {
      parameters.set(key, selected);
    }
  }
  return parameters;
}

function pageLink(filters: AuditTrailFilters, page: number) {
  const query = auditTrailSearchParameters(filters, page).toString();
  return query ? `/dashboard/activity?${query}` : "/dashboard/activity";
}

// Who changed what, and when: the important events first, everything else a click away.
export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireInventoryManagementPageAccess();
  const search = await searchParams;
  const requestedPage = pageParam(search.page);
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
  const loadPage = (page: number) =>
    prisma.inventoryAudit.findMany({
      where,
      include: { item: { select: { assetTag: true, id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

  try {
    const [requestedRows, count] = await Promise.all([
      loadPage(requestedPage),
      prisma.inventoryAudit.count({ where }),
    ]);
    totalRecords = count;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    activity = currentPage === requestedPage ? requestedRows : await loadPage(currentPage);
  } catch (error) {
    console.error("Unable to load audit trail", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const exportParameters = auditTrailSearchParameters(filters);
  exportParameters.set("kind", "activity");
  const exportHref = `/dashboard/reports/export?${exportParameters.toString()}`;
  const pdfExportHref = `/dashboard/reports/export/pdf?${exportParameters.toString()}`;
  const printHref = `/dashboard/reports?${exportParameters.toString()}&generate=1`;

  return (
    <div className="page activity-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Activity</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Audit trail</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              A record of who changed what, and when. Routine activity such as QR scans is tucked
              away until you ask for it.
            </p>
          </div>
          <details className="secondary-actions">
            <summary className="secondary-button cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold">
              Export this view
            </summary>
            <div className="secondary-actions-menu">
              <a href={printHref}>Open to print</a>
              <a href={pdfExportHref}>Export PDF</a>
              <a href={exportHref}>Export CSV</a>
            </div>
          </details>
        </header>

        <AuditFilters filters={filters} />

        {filterError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            {filterError} Showing the default view instead.
          </div>
        ) : null}

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            The audit trail could not be loaded. Confirm the database connection and try again.
          </div>
        ) : activity.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">
            Nothing matches these filters. Try another view, a wider timeframe, or fewer words.
          </div>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="Audit events">
            <div className="divider flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
              <p className="muted text-sm">
                {totalRecords.toLocaleString()} event{totalRecords === 1 ? "" : "s"}
                {totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ""}
              </p>
            </div>
            <AuditEventList events={activity} />
            <Pager
              label="Audit trail"
              currentPage={currentPage}
              totalPages={totalPages}
              hrefForPage={(page) => pageLink(filters, page)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
