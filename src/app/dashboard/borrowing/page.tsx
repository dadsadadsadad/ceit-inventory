export const metadata = { title: "Borrowing · CEIT Inventory" };

import Link from "next/link";

import { OptimisticStatus } from "@/app/components/optimistic-state";
import { Pager } from "@/app/components/pager";
import { borrowStatusLabel } from "@/lib/borrow-status";
import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";
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
  isBorrowStatus,
  isOverdue,
  isOverdueFilter,
  overdueFilter,
  pageLink,
  pageSize,
  statuses,
  type BorrowingRecord,
  type SearchParams,
} from "./borrowing-query";

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
  const loadPage = (page: number) =>
    prisma.borrowRequest.findMany({
      where,
      include: {
        inventoryItem: {
          select: { assetTag: true, id: true, name: true, quantity: true, status: true },
        },
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

  try {
    const [count, requestedRows] = await Promise.all([
      prisma.borrowRequest.count({ where }),
      loadPage(requestedPage),
    ]);
    totalRecords = count;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    requests = currentPage === requestedPage ? requestedRows : await loadPage(currentPage);
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
              href="/dashboard/reports?kind=borrowings"
              className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
            >
              Borrowing reports
            </Link>
          </div>
        </header>

        {/* Search requests and choose a borrowing status. */}
        <form
          className="card grid gap-3 rounded-lg p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end"
          aria-label="Borrowing request filters"
        >
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
                isBorrowStatus(search.status) || isOverdueFilter(search.status)
                  ? firstParam(search.status)
                  : ""
              }
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value={overdueFilter}>Overdue (past return time)</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {borrowStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">
              Filter
            </button>
            <Link
              href="/dashboard/borrowing"
              className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Clear
            </Link>
          </div>
        </form>

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            Borrowing requests could not be loaded. Confirm the database connection and try again.
          </div>
        ) : requests.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">
            No borrowing requests match these filters. Students can submit a request from an
            item&apos;s QR code page.
          </div>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="Borrowing requests">
            <div className="divider border-b px-5 py-3">
              <p className="muted text-sm">
                {totalRecords.toLocaleString()} request{totalRecords === 1 ? "" : "s"} · Page{" "}
                {currentPage} of {totalPages}
              </p>
            </div>

            <div className="record-cards divide-y xl:hidden">
              {requests.map((request) => (
                <article key={request.id} className="space-y-4 p-4">
                  {/* Borrowing request card for mobile. */}
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/dashboard/inventory/${request.inventoryItem.id}`}
                      className="accent-link font-semibold"
                    >
                      {request.inventoryItem.name}
                    </Link>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isOverdue(request) ? (
                        <span className="status-pill status-pill-critical rounded-md px-2.5 py-1 text-xs font-semibold">
                          Overdue
                        </span>
                      ) : null}
                      <OptimisticStatus
                        entity={`borrow:${request.id}`}
                        value={request.status}
                        kind="borrowing"
                      />
                    </div>
                  </div>
                  <BorrowerDetails request={request} />
                  <BorrowSchedule request={request} />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="muted text-xs font-bold uppercase tracking-wide">Quantity</p>
                      <p className="mt-1">
                        {request.requestedQuantity} requested ·{" "}
                        {inventoryAvailabilityLabel(request.inventoryItem)}
                      </p>
                    </div>
                    <div>
                      <p className="muted text-xs font-bold uppercase tracking-wide">Return by</p>
                      <time
                        className="mt-1 block"
                        dateTime={request.expectedReturnDate.toISOString()}
                      >
                        {formatDateTime(request.expectedReturnDate)}
                      </time>
                    </div>
                  </div>
                  <div>
                    <p className="muted text-xs font-bold uppercase tracking-wide">Purpose</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{request.purpose}</p>
                  </div>
                  {request.staffNotes ? (
                    <div>
                      <p className="muted text-xs font-bold uppercase tracking-wide">Staff note</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                        {request.staffNotes}
                      </p>
                    </div>
                  ) : null}
                  {request.returnRequestNotes ? (
                    <div>
                      <p className="muted text-xs font-bold uppercase tracking-wide">
                        Borrower return note
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                        {request.returnRequestNotes}
                      </p>
                    </div>
                  ) : null}
                  {request.processedByName ? (
                    <p className="muted text-xs">
                      Processed by {request.processedByName}
                      {request.processedAt ? ` · ${formatDateTime(request.processedAt)}` : ""}
                    </p>
                  ) : null}
                  {request.returnedByName ? (
                    <p className="muted text-xs">
                      Returned by {request.returnedByName}
                      {request.returnedAt ? ` · ${formatDateTime(request.returnedAt)}` : ""}
                    </p>
                  ) : null}
                  <BorrowingActions request={request} layout="mobile" />
                </article>
              ))}
            </div>

            <div className="record-table hidden overflow-x-auto xl:block">
              {/* Borrowing requests on wider screens. */}
              <table className="w-full">
                <thead>
                  <tr className="table-heading divider border-b">
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
                    >
                      Borrower
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
                    >
                      Request
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} className="table-row border-b align-top last:border-0">
                      <td className="px-5 py-4 text-sm">
                        <Link
                          href={`/dashboard/inventory/${request.inventoryItem.id}`}
                          className="accent-link font-semibold"
                        >
                          {request.inventoryItem.name}
                        </Link>
                        <p className="muted mt-1 text-xs">
                          {request.inventoryItem.assetTag ?? "No asset tag"} ·{" "}
                          {inventoryAvailabilityLabel(request.inventoryItem)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <BorrowerDetails request={request} />
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <p>{request.requestedQuantity} requested</p>
                        <BorrowSchedule request={request} />
                        <p className="muted mt-2 max-w-64 whitespace-pre-wrap text-xs leading-5">
                          {request.purpose}
                        </p>
                        {request.staffNotes ? (
                          <p className="muted mt-2 max-w-64 whitespace-pre-wrap text-xs leading-5">
                            Staff: {request.staffNotes}
                          </p>
                        ) : null}
                        {request.returnRequestNotes ? (
                          <p className="muted mt-2 max-w-64 whitespace-pre-wrap text-xs leading-5">
                            Borrower return note: {request.returnRequestNotes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <OptimisticStatus
                            entity={`borrow:${request.id}`}
                            value={request.status}
                            kind="borrowing"
                          />
                          {isOverdue(request) ? (
                            <span className="status-pill status-pill-critical rounded-md px-2.5 py-1 text-xs font-semibold">
                              Overdue
                            </span>
                          ) : null}
                        </div>
                        <p className="muted mt-3 max-w-48 text-xs leading-5">
                          Requested {formatDateTime(request.requestedAt)}
                        </p>
                        {request.returnRequestedAt ? (
                          <p className="muted mt-2 max-w-48 text-xs leading-5">
                            Return requested {formatDateTime(request.returnRequestedAt)}
                          </p>
                        ) : null}
                        {request.processedByName ? (
                          <p className="muted mt-2 max-w-48 text-xs leading-5">
                            Processed by {request.processedByName}
                            {request.processedAt ? ` · ${formatDateTime(request.processedAt)}` : ""}
                          </p>
                        ) : null}
                        {request.returnedByName ? (
                          <p className="muted mt-2 max-w-48 text-xs leading-5">
                            Returned by {request.returnedByName}
                            {request.returnedAt ? ` · ${formatDateTime(request.returnedAt)}` : ""}
                          </p>
                        ) : null}
                      </td>
                      <td className="min-w-[22rem] px-5 py-4">
                        <BorrowingActions request={request} layout="desktop" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
