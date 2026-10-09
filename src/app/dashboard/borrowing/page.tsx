export const metadata = { title: "Borrowing · CEIT Inventory" };

import Link from "next/link";

import { ClearFiltersButton, FilterForm } from "@/app/components/filter-form";
import { OptimisticStatus } from "@/app/components/optimistic-state";
import { Pager } from "@/app/components/pager";
import { borrowStatusLabel } from "@/lib/borrow-status";
import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";
import { personName } from "@/lib/person";
import { firstParam, pageParam, textParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { BorrowingActions } from "./borrowing-actions-panel";
import {
  BorrowSchedule,
  BorrowerDetails,
  formatDateTime,
  inventoryAvailabilityLabel,
} from "./borrowing-details";
import {
  borrowRequestWhere,
  borrowingListTiers,
  dueTodayFilter,
  isBorrowStatus,
  isDueTodayFilter,
  isOverdue,
  isOverdueFilter,
  lapsedLabel,
  overdueFilter,
  pageLink,
  pageSize,
  reportHref,
  statuses,
  type BorrowingRecord,
  type SearchParams,
} from "./borrowing-query";
import { HandHelping } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";

export const dynamic = "force-dynamic";

// Load borrowing requests for the selected filters.
export default async function BorrowingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireInventoryManagementPageAccess();
  const search = await searchParams;
  const where = borrowRequestWhere(search);
  const requestedPage = pageParam(search.page);
  let databaseError = false;
  let requests: BorrowingRecord[] = [];
  let totalRecords = 0;
  let currentPage = requestedPage;
  const tierWhere = borrowingListTiers.map((tier) => ({
    AND: [where, { status: { in: tier } }],
  }));
  // One page across the groups in order: the rest of one group, then the start of the next.
  const loadPage = async (page: number, tierCounts: number[]) => {
    let skip = (page - 1) * pageSize;
    const rows: BorrowingRecord[] = [];
    for (const [index, count] of tierCounts.entries()) {
      if (rows.length === pageSize) {
        break;
      }
      if (skip >= count) {
        skip -= count;
        continue;
      }
      rows.push(
        ...(await prisma.borrowRequest.findMany({
          where: tierWhere[index],
          include: {
            inventoryItem: {
              select: { assetTag: true, id: true, name: true, quantity: true, status: true },
            },
          },
          orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
          skip,
          take: pageSize - rows.length,
        })),
      );
      skip = 0;
    }
    return rows;
  };

  try {
    const tierCounts = await Promise.all(
      tierWhere.map((tier) => prisma.borrowRequest.count({ where: tier })),
    );
    totalRecords = tierCounts.reduce((total, count) => total + count, 0);
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    requests = await loadPage(currentPage, tierCounts);
  } catch (error) {
    console.error("Unable to load borrowing requests", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return (
    <div className="page borrowing-page">
      <div className="page-inner space-y-6">
        {/* Borrowing title and summary. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Equipment lending</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Borrowing</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Review requests and reservations, check out equipment, and confirm returns.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/reports?kind=borrowing"
              className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
            >
              Borrowing reports
            </Link>
          </div>
        </header>

        {/* Search requests and narrow them down. Choices apply as soon as they are made. */}
        <FilterForm className="filter-spread card rounded-lg p-4" label="Borrowing request filters">
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input
              name="q"
              defaultValue={textParam(search.q)}
              maxLength={120}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Borrower, student number, contact, item, or asset tag"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Request status</span>
            <select
              name="status"
              defaultValue={
                isBorrowStatus(search.status) ||
                isOverdueFilter(search.status) ||
                isDueTodayFilter(search.status)
                  ? firstParam(search.status)
                  : ""
              }
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value={overdueFilter}>Overdue (past return time)</option>
              <option value={dueTodayFilter}>Due back today</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {borrowStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Kind</span>
            <select
              name="type"
              defaultValue={
                firstParam(search.type) === "reservation" || firstParam(search.type) === "now"
                  ? firstParam(search.type)
                  : ""
              }
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Any kind</option>
              <option value="reservation">Reservations</option>
              <option value="now">Borrow now</option>
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Requested from</span>
            <input
              type="date"
              name="from"
              defaultValue={textParam(search.from)}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Requested to</span>
            <input
              type="date"
              name="to"
              defaultValue={textParam(search.to)}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 xl:col-span-5">
            <ClearFiltersButton className="accent-link text-sm font-semibold">
              Clear all filters
            </ClearFiltersButton>
            <Link href={reportHref(search)} className="accent-link text-sm font-semibold">
              Open as report
            </Link>
          </div>
        </FilterForm>

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            Borrowing requests could not be loaded. Confirm the database connection and try again.
          </div>
        ) : requests.length === 0 ? (
          <EmptyState icon={HandHelping} title="No borrowing requests match these filters.">
            Students can submit a request from an item&apos;s QR code page.
          </EmptyState>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="Borrowing requests">
            <div className="divider border-b px-5 py-3">
              <p className="muted text-sm">
                {totalRecords.toLocaleString()} request{totalRecords === 1 ? "" : "s"} · Page{" "}
                {currentPage} of {totalPages}
              </p>
            </div>

            <div className="request-list">
              {requests.map((request) => {
                const overdue = isOverdue(request);
                const lapsed = lapsedLabel(request);
                return (
                  <article key={request.id} className="request-card">
                    <header className="request-card-head">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/inventory/${request.inventoryItem.id}`}
                          className="accent-link text-base font-semibold"
                        >
                          {request.inventoryItem.name}
                        </Link>
                        <p className="muted mt-1 text-sm">
                          <span className="asset-code">
                            {request.inventoryItem.assetTag ?? "No asset tag"}
                          </span>{" "}
                          · {inventoryAvailabilityLabel(request.inventoryItem)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {overdue ? (
                          <span className="status-pill status-pill-critical rounded-md px-2.5 py-1 text-xs font-semibold">
                            Overdue
                          </span>
                        ) : null}
                        {lapsed ? (
                          <span className="status-pill status-pill-pending rounded-md px-2.5 py-1 text-xs font-semibold">
                            {lapsed}
                          </span>
                        ) : null}
                        <OptimisticStatus
                          entity={`borrow:${request.id}`}
                          value={request.status}
                          kind="borrowing"
                        />
                      </div>
                    </header>

                    <div className="request-card-grid">
                      <section aria-label="Borrower">
                        <p className="request-label">Borrower</p>
                        <BorrowerDetails request={request} />
                      </section>
                      <section aria-label="Request">
                        <p className="request-label">Request</p>
                        <p className="text-sm">
                          {request.requestedQuantity}{" "}
                          {request.requestedQuantity === 1 ? "unit" : "units"} requested
                        </p>
                        <BorrowSchedule request={request} />
                        <p className="muted mt-2 whitespace-pre-wrap text-sm leading-6">
                          {request.purpose}
                        </p>
                        {request.staffNotes ? (
                          <p className="muted mt-2 whitespace-pre-wrap text-sm leading-6">
                            Staff: {request.staffNotes}
                          </p>
                        ) : null}
                        {request.returnRequestNotes ? (
                          <p className="muted mt-2 whitespace-pre-wrap text-sm leading-6">
                            Borrower return note: {request.returnRequestNotes}
                          </p>
                        ) : null}
                      </section>
                      <section aria-label="History">
                        <p className="request-label">History</p>
                        <ul className="request-history">
                          <li>Requested {formatDateTime(request.requestedAt)}</li>
                          {request.returnRequestedAt ? (
                            <li>Return requested {formatDateTime(request.returnRequestedAt)}</li>
                          ) : null}
                          {request.processedByName ? (
                            <li>
                              Processed by {personName(request.processedByName)}
                              {request.processedAt
                                ? ` · ${formatDateTime(request.processedAt)}`
                                : ""}
                            </li>
                          ) : null}
                          {request.returnedByName ? (
                            <li>
                              Returned by {personName(request.returnedByName)}
                              {request.returnedAt ? ` · ${formatDateTime(request.returnedAt)}` : ""}
                            </li>
                          ) : null}
                          {request.remindedAt ? (
                            <li>Reminded {formatDateTime(request.remindedAt)}</li>
                          ) : null}
                        </ul>
                      </section>
                    </div>

                    <footer className="request-card-actions">
                      <BorrowingActions request={request} />
                    </footer>
                  </article>
                );
              })}
            </div>

            <Pager
              label="Borrowing request"
              currentPage={currentPage}
              totalPages={totalPages}
              hrefForPage={(page) => pageLink(search, page)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
