import type { BorrowStatus, Prisma } from "@prisma/client";

import { borrowStatus, borrowStatuses } from "@/lib/borrow-status";
import { firstParam, textParam, type RawParam } from "@/lib/search-params";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";

export const pageSize = 25;

export type SearchParams = { page?: RawParam; q?: RawParam; status?: RawParam };
export type BorrowingRecord = Prisma.BorrowRequestGetPayload<{
  include: {
    inventoryItem: {
      select: { assetTag: true; id: true; name: true; quantity: true; status: true };
    };
  };
}>;

export const statuses = borrowStatuses;

export function isBorrowStatus(value?: string | string[]): value is BorrowStatus {
  const candidate = firstParam(value);
  return Boolean(candidate && statuses.includes(candidate as BorrowStatus));
}

// "Overdue" is not a stored status: it is equipment still out past its return time.
export const overdueFilter = "OVERDUE";

export function isOverdueFilter(value?: string | string[]) {
  return firstParam(value) === overdueFilter;
}

export function isOverdue(request: BorrowingRecord, now = new Date()) {
  return (
    (request.status === borrowStatus.BORROWED ||
      request.status === borrowStatus.RETURN_REQUESTED) &&
    request.expectedReturnDate < now
  );
}

// Build the search and status filters for borrowing.
export function borrowRequestWhere(search: SearchParams): Prisma.BorrowRequestWhereInput {
  const query = textParam(search.q);
  const where: Prisma.BorrowRequestWhereInput = {};
  if (isBorrowStatus(search.status)) {
    where.status = firstParam(search.status) as BorrowStatus;
  } else if (isOverdueFilter(search.status)) {
    where.status = { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] };
    where.expectedReturnDate = { lt: new Date() };
  }
  const terms = searchTerms(query);
  if (terms.length) {
    where.AND = everyTermMatches<Prisma.BorrowRequestWhereInput>(terms, (term) => [
      { borrowerName: { contains: term, mode: "insensitive" } },
      { studentNumber: { contains: term, mode: "insensitive" } },
      { contact: { contains: term, mode: "insensitive" } },
      { inventoryItem: { is: { name: { contains: term, mode: "insensitive" } } } },
      { inventoryItem: { is: { assetTag: { contains: term, mode: "insensitive" } } } },
    ]);
  }
  return where;
}

export function pageLink(search: SearchParams, page: number) {
  const parameters = new URLSearchParams();
  const query = textParam(search.q);
  const status = firstParam(search.status);
  if (query) {
    parameters.set("q", query);
  }
  if (status && (isBorrowStatus(status) || status === overdueFilter)) {
    parameters.set("status", status);
  }
  if (page > 1) {
    parameters.set("page", String(page));
  }
  const queryString = parameters.toString();
  return queryString ? `/dashboard/borrowing?${queryString}` : "/dashboard/borrowing";
}
