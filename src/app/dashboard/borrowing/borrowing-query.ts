import type { BorrowStatus, Prisma } from "@prisma/client";

import { borrowPolicyFromEnvironment } from "@/lib/borrow-policy";
import { isHoldLapsed } from "@/lib/borrow-schedule";
import { borrowStatus, borrowStatuses } from "@/lib/borrow-status";
import { firstParam, textParam, type RawParam } from "@/lib/search-params";
import { borrowSearchWhere } from "@/lib/record-search";
import { lenientDateRange, reportDateFilter } from "@/lib/report-export-filters";
import { searchTerms } from "@/lib/search-terms";

export const pageSize = 25;

export type SearchParams = {
  from?: RawParam;
  page?: RawParam;
  q?: RawParam;
  status?: RawParam;
  to?: RawParam;
  type?: RawParam;
};
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

// A short reason a pending or reserved request no longer holds the equipment.
export function lapsedLabel(request: BorrowingRecord, now = new Date()) {
  if (!isHoldLapsed(request, now, borrowPolicyFromEnvironment())) {
    return null;
  }
  return request.status === borrowStatus.RESERVED ? "Pickup missed" : "Not handled in time";
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
    where.AND = borrowSearchWhere(query);
  }
  const requested = reportDateFilter(
    lenientDateRange(textParam(search.from), textParam(search.to)),
  );
  if (requested) {
    where.requestedAt = requested;
  }
  const type = firstParam(search.type);
  if (type === "reservation" || type === "now") {
    where.isReservation = type === "reservation";
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
  for (const key of ["from", "to"] as const) {
    const value = textParam(search[key]);
    if (value) {
      parameters.set(key, value);
    }
  }
  const type = firstParam(search.type);
  if (type === "reservation" || type === "now") {
    parameters.set("type", type);
  }
  if (page > 1) {
    parameters.set("page", String(page));
  }
  const queryString = parameters.toString();
  return queryString ? `/dashboard/borrowing?${queryString}` : "/dashboard/borrowing";
}

// The report that matches the filters on screen.
export function reportHref(search: SearchParams) {
  const parameters = new URLSearchParams({ kind: "borrowing" });
  const status = firstParam(search.status);
  const state =
    status === overdueFilter ? "overdue" : isBorrowStatus(status) ? reportStates[status] : "";
  if (state) {
    parameters.set("borrowingState", state);
  }
  for (const key of ["q", "from", "to"] as const) {
    const value = textParam(search[key]);
    if (value) {
      parameters.set(key, value);
    }
  }
  return `/dashboard/reports?${parameters.toString()}&generate=1`;
}

const reportStates: Record<BorrowStatus, string> = {
  REQUESTED: "requested",
  RESERVED: "reserved",
  BORROWED: "currently-borrowed",
  RETURN_REQUESTED: "currently-borrowed",
  RETURNED: "returned",
  DECLINED: "declined",
  CANCELLED: "cancelled",
};
