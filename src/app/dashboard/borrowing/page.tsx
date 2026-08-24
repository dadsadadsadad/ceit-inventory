import Link from "next/link";

import type { BorrowStatus, Prisma } from "@prisma/client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { borrowStatus, borrowStatuses } from "@/lib/borrow-status";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

import { declineBorrowRequest, markBorrowed, returnBorrowRequest } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string | string[]; q?: string | string[]; status?: string | string[] };
type BorrowingRecord = Prisma.BorrowRequestGetPayload<{
  include: { inventoryItem: { select: { assetTag: true; id: true; name: true; quantity: true } } };
}>;

const pageSize = 25;
const statuses = borrowStatuses;

function firstSearchValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function safePage(value?: string | string[]) {
  const parsed = Number(firstSearchValue(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function isBorrowStatus(value?: string | string[]): value is BorrowStatus {
  const candidate = firstSearchValue(value);
  return Boolean(candidate && statuses.includes(candidate as BorrowStatus));
}

function shortSearch(value?: string | string[]) {
  return firstSearchValue(value)?.trim().slice(0, 120) ?? "";
}

function borrowRequestWhere(search: SearchParams): Prisma.BorrowRequestWhereInput {
  const query = shortSearch(search.q);
  const where: Prisma.BorrowRequestWhereInput = {};
  if (isBorrowStatus(search.status)) where.status = firstSearchValue(search.status) as BorrowStatus;
  if (query) {
    where.OR = [
      { borrowerName: { contains: query, mode: "insensitive" } },
      { studentNumber: { contains: query, mode: "insensitive" } },
      { inventoryItem: { is: { name: { contains: query, mode: "insensitive" } } } },
      { inventoryItem: { is: { assetTag: { contains: query, mode: "insensitive" } } } },
    ];
  }
  return where;
}

function pageLink(search: SearchParams, page: number) {
  const parameters = new URLSearchParams();
  const query = shortSearch(search.q);
  const status = firstSearchValue(search.status);
  if (query) parameters.set("q", query);
  if (status && isBorrowStatus(status)) parameters.set("status", status);
  if (page > 1) parameters.set("page", String(page));
  const queryString = parameters.toString();
  return queryString ? `/dashboard/borrowing?${queryString}` : "/dashboard/borrowing";
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

function borrowStatusLabel(status: BorrowStatus) {
  return status.toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function borrowStatusClass(status: BorrowStatus) {
  switch (status) {
    case borrowStatus.REQUESTED:
      return "status-pill status-pill-pending";
    case borrowStatus.BORROWED:
      return "status-pill status-pill-deployed";
    case borrowStatus.RETURN_REQUESTED:
      return "status-pill status-pill-pending";
    case borrowStatus.RETURNED:
      return "status-pill status-pill-positive";
    case borrowStatus.DECLINED:
      return "status-pill status-pill-critical";
  }
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: Date) {
  return value.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function BorrowingActions({ request }: { request: BorrowingRecord }) {
  if (request.status === borrowStatus.REQUESTED) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <FeedbackForm action={markBorrowed} className="flex flex-1 flex-wrap gap-2">
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`approve-note-${request.id}`}>Approval note</label>
          <input id={`approve-note-${request.id}`} name="staffNotes" maxLength={2_000} className="field min-w-40 flex-1 rounded-lg px-3 py-2 text-sm" placeholder="Optional staff note" />
          <SubmitButton pendingLabel="Checking out…" className="primary-button rounded-lg px-3 py-2 text-sm font-semibold">Mark borrowed</SubmitButton>
        </FeedbackForm>
        <FeedbackForm action={declineBorrowRequest} className="flex flex-1 flex-wrap gap-2">
          <input type="hidden" name="requestId" value={request.id} />
          <label className="sr-only" htmlFor={`decline-note-${request.id}`}>Decline note</label>
          <input id={`decline-note-${request.id}`} name="staffNotes" maxLength={2_000} className="field min-w-40 flex-1 rounded-lg px-3 py-2 text-sm" placeholder="Reason or staff note" />
          <SubmitButton pendingLabel="Declining…" className="rounded-lg border border-red-500/50 px-3 py-2 text-sm font-semibold text-red-400 hover:border-red-400 hover:text-red-300">Decline</SubmitButton>
        </FeedbackForm>
      </div>
    );
  }

  if (request.status === borrowStatus.BORROWED || request.status === borrowStatus.RETURN_REQUESTED) {
    return (
      <FeedbackForm action={returnBorrowRequest} className="flex flex-wrap gap-2">
        <input type="hidden" name="requestId" value={request.id} />
        <label className="sr-only" htmlFor={`return-note-${request.id}`}>Return note</label>
        <input id={`return-note-${request.id}`} name="staffNotes" maxLength={2_000} className="field min-w-48 flex-1 rounded-lg px-3 py-2 text-sm" placeholder="Optional return note" />
        <SubmitButton pendingLabel="Recording…" className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold">{request.status === borrowStatus.RETURN_REQUESTED ? "Confirm returned" : "Mark returned"}</SubmitButton>
      </FeedbackForm>
    );
  }

  return <p className="muted text-sm">No further action is needed.</p>;
}

function BorrowerDetails({ request }: { request: BorrowingRecord }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">{request.borrowerName}</p>
      <p className="muted">{request.studentNumber}</p>
      <p className="muted">{request.contact}</p>
    </div>
  );
}

export default async function BorrowingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWriteAccess();
  const search = await searchParams;
  const where = borrowRequestWhere(search);
  const requestedPage = safePage(search.page);
  let databaseError = false;
  let requests: BorrowingRecord[] = [];
  let totalRecords = 0;
  let currentPage = requestedPage;

  try {
    totalRecords = await prisma.borrowRequest.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    requests = await prisma.borrowRequest.findMany({
      where,
      include: { inventoryItem: { select: { assetTag: true, id: true, name: true, quantity: true } } },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
  } catch (error) {
    console.error("Unable to load borrowing requests", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return (
    <div className="page borrowing-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Equipment lending</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Borrowing history</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">Review requests, confirm QR return requests, and keep a complete equipment lending history.</p>
          </div>
          <Link href="/dashboard/inventory" className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">View inventory</Link>
        </header>

        <form className="card grid gap-3 rounded-lg p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end" aria-label="Borrowing request filters">
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input name="q" defaultValue={shortSearch(search.q)} maxLength={120} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Borrower, student number, item, or asset tag" />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Request status</span>
            <select name="status" defaultValue={isBorrowStatus(search.status) ? firstSearchValue(search.status) : ""} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{borrowStatusLabel(status)}</option>)}
            </select>
          </label>
          <div className="flex gap-3">
            <button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Filter</button>
            <Link href="/dashboard/borrowing" className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold">Clear</Link>
          </div>
        </form>

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">Borrowing requests could not be loaded. Confirm the database connection and try again.</div>
        ) : requests.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">No borrowing requests match these filters. Students can submit a request from an item&apos;s QR page.</div>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="Borrowing requests">
            <div className="divider border-b px-5 py-3">
              <p className="muted text-sm">{totalRecords.toLocaleString()} request{totalRecords === 1 ? "" : "s"} · Page {currentPage} of {totalPages}</p>
            </div>

            <div className="divide-y md:hidden">
              {requests.map((request) => (
                <article key={request.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/dashboard/inventory/${request.inventoryItem.id}`} className="accent-link font-semibold">{request.inventoryItem.name}</Link>
                    <span className={`${borrowStatusClass(request.status)} shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold`}>{borrowStatusLabel(request.status)}</span>
                  </div>
                  <BorrowerDetails request={request} />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="muted text-xs font-bold uppercase tracking-wide">Quantity</p><p className="mt-1">{request.requestedQuantity} requested · {request.inventoryItem.quantity} available</p></div>
                    <div><p className="muted text-xs font-bold uppercase tracking-wide">Return by</p><time className="mt-1 block" dateTime={request.expectedReturnDate.toISOString()}>{formatDate(request.expectedReturnDate)}</time></div>
                  </div>
                  <div><p className="muted text-xs font-bold uppercase tracking-wide">Purpose</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{request.purpose}</p></div>
                  {request.staffNotes ? <div><p className="muted text-xs font-bold uppercase tracking-wide">Staff note</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{request.staffNotes}</p></div> : null}
                  {request.returnRequestNotes ? <div><p className="muted text-xs font-bold uppercase tracking-wide">Borrower return note</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{request.returnRequestNotes}</p></div> : null}
                  {request.processedByName ? <p className="muted text-xs">Processed by {request.processedByName}{request.processedAt ? ` · ${formatDateTime(request.processedAt)}` : ""}</p> : null}
                  {request.returnedByName ? <p className="muted text-xs">Returned by {request.returnedByName}{request.returnedAt ? ` · ${formatDateTime(request.returnedAt)}` : ""}</p> : null}
                  <BorrowingActions request={request} />
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead>
                  <tr className="table-heading divider border-b">
                    <th scope="col" className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">Item</th>
                    <th scope="col" className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">Borrower</th>
                    <th scope="col" className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">Request</th>
                    <th scope="col" className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">Status</th>
                    <th scope="col" className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} className="table-row border-b align-top last:border-0">
                      <td className="px-5 py-4 text-sm"><Link href={`/dashboard/inventory/${request.inventoryItem.id}`} className="accent-link font-semibold">{request.inventoryItem.name}</Link><p className="muted mt-1 text-xs">{request.inventoryItem.assetTag ?? "No asset tag"} · {request.inventoryItem.quantity} available</p></td>
                      <td className="px-5 py-4"><BorrowerDetails request={request} /></td>
                      <td className="px-5 py-4 text-sm"><p>{request.requestedQuantity} requested</p><p className="muted mt-1">Return by {formatDate(request.expectedReturnDate)}</p><p className="muted mt-2 max-w-64 whitespace-pre-wrap text-xs leading-5">{request.purpose}</p>{request.staffNotes ? <p className="muted mt-2 max-w-64 whitespace-pre-wrap text-xs leading-5">Staff: {request.staffNotes}</p> : null}{request.returnRequestNotes ? <p className="muted mt-2 max-w-64 whitespace-pre-wrap text-xs leading-5">Borrower return note: {request.returnRequestNotes}</p> : null}</td>
                      <td className="px-5 py-4"><span className={`${borrowStatusClass(request.status)} rounded-md px-2.5 py-1 text-xs font-semibold`}>{borrowStatusLabel(request.status)}</span><p className="muted mt-3 max-w-48 text-xs leading-5">Requested {formatDateTime(request.requestedAt)}</p>{request.returnRequestedAt ? <p className="muted mt-2 max-w-48 text-xs leading-5">Return requested {formatDateTime(request.returnRequestedAt)}</p> : null}{request.processedByName ? <p className="muted mt-2 max-w-48 text-xs leading-5">Processed by {request.processedByName}{request.processedAt ? ` · ${formatDateTime(request.processedAt)}` : ""}</p> : null}{request.returnedByName ? <p className="muted mt-2 max-w-48 text-xs leading-5">Returned by {request.returnedByName}{request.returnedAt ? ` · ${formatDateTime(request.returnedAt)}` : ""}</p> : null}</td>
                      <td className="min-w-[25rem] px-5 py-4"><BorrowingActions request={request} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav className="divider flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" aria-label="Borrowing request pages">
                {currentPage > 1 ? <Link href={pageLink(search, currentPage - 1)} className="pagination-link px-3 text-sm font-semibold">← Previous</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">← Previous</span>}
                <div className="order-3 flex w-full items-center justify-center gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0" aria-label="Choose borrowing request page">
                  {paginationEntries(totalPages, currentPage).map((entry, index) => entry === null ? <span key={`gap-${index}`} className="muted px-1 text-sm" aria-hidden="true">…</span> : entry === currentPage ? <span key={entry} className="pagination-current text-sm font-semibold" aria-current="page">{entry}</span> : <Link key={entry} href={pageLink(search, entry)} className="pagination-link text-sm font-semibold" aria-label={`Go to page ${entry}`}>{entry}</Link>)}
                </div>
                {currentPage < totalPages ? <Link href={pageLink(search, currentPage + 1)} className="pagination-link px-3 text-sm font-semibold">Next →</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">Next →</span>}
              </nav>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
