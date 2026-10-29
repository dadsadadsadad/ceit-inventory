export const metadata = { title: "Maintenance · CEIT Inventory" };

import { OptimisticStatus, OptimisticText } from "@/app/components/optimistic-state";
import { Pager } from "@/app/components/pager";
import Link from "next/link";

import { ItemStatus, MaintenancePriority, MaintenanceStatus, type Prisma } from "@prisma/client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { ItemPicker } from "@/app/components/item-picker";
import { ClearFiltersButton, FilterForm } from "@/app/components/filter-form";
import { SubmitButton } from "@/app/components/submit-button";
import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { formatManilaDate } from "@/lib/manila-date";
import { maintenanceSearchWhere } from "@/lib/record-search";
import { lenientDateRange, reportDateFilter } from "@/lib/report-export-filters";
import { searchTerms } from "@/lib/search-terms";
import { firstParam, pageParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { createMaintenanceTicket, updateMaintenanceTicket } from "./actions";
import { Wrench } from "lucide-react";
import { EmptyState } from "@/app/components/empty-state";

export const dynamic = "force-dynamic";

type SearchParams = {
  item?: string | string[];
  status?: string | string[];
  created?: string | string[];
  source?: string | string[];
  q?: string | string[];
  priority?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
  report?: string | string[];
};

const resolutionItemStatuses = [
  ItemStatus.OK,
  ItemStatus.WORKING,
  ItemStatus.NOT_TESTED,
  ItemStatus.DEFECTIVE,
];

function statusLabel(status: MaintenanceStatus) {
  return status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved";
}

function priorityLabel(priority: MaintenancePriority) {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function formatDate(value: Date) {
  return formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" });
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireInventoryManagementPageAccess();
  const search = await searchParams;
  const requestedStatus = firstParam(search.status);
  const status = Object.values(MaintenanceStatus).includes(requestedStatus as MaintenanceStatus)
    ? (requestedStatus as MaintenanceStatus)
    : undefined;
  const requestedItem = firstParam(search.item);
  const selectedItem =
    requestedItem &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedItem)
      ? requestedItem
      : undefined;
  const reporting = firstParam(search.report) === "1" || Boolean(selectedItem);
  const source = ["QR", "STAFF"].includes(firstParam(search.source) ?? "")
    ? firstParam(search.source)
    : undefined;
  const query = firstParam(search.q)?.trim().slice(0, 120) ?? "";
  const requestedPriority = firstParam(search.priority);
  const priority = Object.values(MaintenancePriority).includes(
    requestedPriority as MaintenancePriority,
  )
    ? (requestedPriority as MaintenancePriority)
    : undefined;
  const fromDate = firstParam(search.from)?.slice(0, 10) ?? "";
  const toDate = firstParam(search.to)?.slice(0, 10) ?? "";
  const opened = reportDateFilter(lenientDateRange(fromDate, toDate));
  const where: Prisma.MaintenanceTicketWhereInput = {
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(priority ? { priority } : {}),
    ...(opened ? { openedAt: opened } : {}),
    ...(selectedItem ? { inventoryItemId: selectedItem } : {}),
    ...(searchTerms(query).length ? { AND: maintenanceSearchWhere(query) } : {}),
  };
  const requestedPage = pageParam(search.page);
  function pageHref(next: number) {
    const params = new URLSearchParams({ page: String(next) });
    if (source) {
      params.set("source", source);
    }
    if (status) {
      params.set("status", status);
    }
    if (query) {
      params.set("q", query);
    }
    if (priority) {
      params.set("priority", priority);
    }
    if (fromDate) {
      params.set("from", fromDate);
    }
    if (toDate) {
      params.set("to", toDate);
    }
    if (selectedItem) {
      params.set("item", selectedItem);
    }
    return `/dashboard/maintenance?${params}`;
  }
  const loadTickets = (page: number) =>
    prisma.maintenanceTicket.findMany({
      where,
      include: {
        inventoryItem: { select: { assetTag: true, id: true, name: true, status: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { openedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 25,
      take: 25,
    });
  const [preselected, requestedTickets, count] = await Promise.all([
    // preselect the item when coming from an item page or scan
    reporting && selectedItem
      ? prisma.inventoryItem.findFirst({
          where: { id: selectedItem, status: { not: ItemStatus.RETIRED } },
          select: { assetTag: true, id: true, name: true, location: { select: { name: true } } },
        })
      : Promise.resolve(null),
    loadTickets(requestedPage),
    prisma.maintenanceTicket.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / 25));
  const page = Math.min(requestedPage, totalPages);
  const tickets = page === requestedPage ? requestedTickets : await loadTickets(page);

  return (
    <div className="page maintenance-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="title text-3xl sm:text-4xl">Maintenance requests</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">Reported problems and repairs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/reports?kind=maintenance"
              className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
            >
              Maintenance reports
            </Link>
            <Link
              href="/dashboard/maintenance?report=1#report-issue"
              className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Report an issue
            </Link>
          </div>
        </header>

        {firstParam(search.created) === "1" ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Maintenance request reported.
          </div>
        ) : null}

        {reporting ? (
          <section id="report-issue" className="card scroll-mt-6 rounded-lg p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Report an issue</h2>
              <Link href="/dashboard/maintenance" className="accent-link text-sm font-semibold">
                Close form
              </Link>
            </div>
            <FeedbackForm
              action={createMaintenanceTicket}
              createPreview={{ titleField: "title", detailFields: ["itemId", "description"] }}
              className="mt-5 space-y-4"
            >
              <div>
                <p className="muted mt-1 text-sm">For anything broken or needing a check.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ItemPicker
                  name="itemId"
                  label="Equipment *"
                  initial={
                    preselected
                      ? {
                          id: preselected.id,
                          name: preselected.name,
                          assetTag: preselected.assetTag,
                          location: preselected.location.name,
                        }
                      : null
                  }
                />
                <label>
                  <span className="text-sm font-semibold">Priority</span>
                  <select
                    name="priority"
                    defaultValue={MaintenancePriority.NORMAL}
                    className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                  >
                    {Object.values(MaintenancePriority).map((priority) => (
                      <option key={priority} value={priority}>
                        {priorityLabel(priority)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-semibold">Issue title *</span>
                <input
                  required
                  name="title"
                  maxLength={255}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                  placeholder="e.g. Screen won't turn on"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">What happened? *</span>
                <textarea
                  required
                  name="description"
                  rows={4}
                  maxLength={5_000}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                  placeholder="What's wrong?"
                />
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input name="markDefective" type="checkbox" className="h-4 w-4" />
                <span>Mark as defective</span>
              </label>
              <SubmitButton
                pendingLabel="Reporting..."
                className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
              >
                Submit maintenance request
              </SubmitButton>
            </FeedbackForm>
          </section>
        ) : null}

        <FilterForm className="filter-spread card rounded-lg p-4" label="Maintenance filters">
          {selectedItem ? <input type="hidden" name="item" value={selectedItem} /> : null}
          <label className="min-w-0 flex-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input
              type="search"
              enterKeyHint="search"
              aria-keyshortcuts="/"
              name="q"
              defaultValue={query}
              maxLength={120}
              placeholder="Issue, item or tag"
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Source</span>
            <select
              name="source"
              defaultValue={source ?? ""}
              className="field mt-2 block rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">All reports</option>
              <option value="QR">QR issue reports</option>
              <option value="STAFF">Staff reports</option>
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Status</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="field mt-2 rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">All requests</option>
              {Object.values(MaintenanceStatus).map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Priority</span>
            <select
              name="priority"
              defaultValue={priority ?? ""}
              className="field mt-2 rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Any priority</option>
              {Object.values(MaintenancePriority).map((value) => (
                <option key={value} value={value}>
                  {priorityLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Reported from</span>
            <input
              type="date"
              name="from"
              defaultValue={fromDate}
              className="field mt-2 rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Reported to</span>
            <input
              type="date"
              name="to"
              defaultValue={toDate}
              className="field mt-2 rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <ClearFiltersButton className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">
              Clear all filters
            </ClearFiltersButton>
            <Link
              href={`/dashboard/reports?${new URLSearchParams(
                Object.entries({
                  kind: "maintenance",
                  q: query,
                  maintenanceSource: source ?? "",
                  maintenanceStatus: status ?? "",
                  maintenancePriority: priority ?? "",
                  from: fromDate,
                  to: toDate,
                  generate: "1",
                }).filter(([, value]) => value),
              )}`}
              className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
            >
              Open as report
            </Link>
          </div>
        </FilterForm>

        <section className="space-y-4" aria-label="Maintenance requests">
          <p className="muted text-sm">
            {count} request{count === 1 ? "" : "s"} · Page {page} of {totalPages}
          </p>
          {tickets.length ? (
            tickets.map((ticket) => (
              <article
                key={ticket.id}
                id={`ticket-${ticket.id}`}
                className="card scroll-mt-6 rounded-lg p-5 sm:p-6"
              >
                <div className="maintenance-ticket-grid">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <OptimisticStatus
                        entity={`ticket:${ticket.id}`}
                        value={ticket.status}
                        kind="maintenance"
                      />
                      <span className="card-muted rounded-md px-2.5 py-1 text-xs font-semibold">
                        <OptimisticText entity={`ticket:${ticket.id}`} field="priority">
                          {priorityLabel(ticket.priority)}
                        </OptimisticText>{" "}
                        priority
                      </span>
                      {ticket.source === "QR" ? (
                        <span className="status-pill status-pill-deployed rounded-md px-2.5 py-1 text-xs font-semibold">
                          QR issue report
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-lg font-semibold">{ticket.title}</h2>
                    <Link
                      href={`/dashboard/inventory/${ticket.inventoryItem.id}`}
                      className="accent-link mt-1 inline-block text-sm font-semibold"
                    >
                      {ticket.inventoryItem.name}
                      {ticket.inventoryItem.assetTag ? ` · ${ticket.inventoryItem.assetTag}` : ""}
                    </Link>
                    <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6">
                      {ticket.description}
                    </p>
                    <p className="muted mt-3 text-xs">
                      Reported {formatDate(ticket.openedAt)}
                      {ticket.source === "QR"
                        ? `${ticket.reportedByName ? ` by ${ticket.reportedByName}` : ""} through a QR code`
                        : ` by ${ticket.reportedByName ?? "Staff"}`}
                    </p>
                    {ticket.resolvedAt ? (
                      <p className="muted mt-1 text-xs">Resolved {formatDate(ticket.resolvedAt)}</p>
                    ) : null}
                    {ticket.resolutionNotes ? (
                      <p className="ticket-staff-note mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6">
                        <strong>Staff notes</strong> {ticket.resolutionNotes}
                      </p>
                    ) : null}
                  </div>
                  <details className="section-disclosure min-w-0">
                    <summary className="secondary-button inline-flex cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold">
                      Update request
                    </summary>
                    <FeedbackForm
                      action={updateMaintenanceTicket}
                      revision={ticket.updatedAt.toISOString()}
                      savedValues={{
                        status: ticket.status,
                        priority: ticket.priority,
                        itemStatus: "",
                      }}
                      optimistic={{
                        entity: `ticket:${ticket.id}`,
                        fields: { status: "status", priority: "priority" },
                      }}
                      resetOnSuccess={false}
                      className="mt-4 w-full min-w-0 space-y-3"
                    >
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <input
                        type="hidden"
                        name="updatedAt"
                        value={ticket.updatedAt.toISOString()}
                      />
                      <label className="block text-sm">
                        <span className="font-semibold">Priority</span>
                        <select
                          name="priority"
                          defaultValue={ticket.priority}
                          className="field mt-2 w-full rounded-lg px-3 py-2.5"
                        >
                          {Object.values(MaintenancePriority).map((value) => (
                            <option key={value} value={value}>
                              {priorityLabel(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-semibold">Status</span>
                        <select
                          required
                          name="status"
                          defaultValue={ticket.status}
                          className="field mt-2 w-full rounded-lg px-3 py-2.5"
                        >
                          <option value={MaintenanceStatus.OPEN}>Needs attention</option>
                          <option value={MaintenanceStatus.RESOLVED}>Resolved</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="font-semibold">Staff notes</span>
                        <textarea
                          name="resolutionNotes"
                          rows={3}
                          defaultValue={ticket.resolutionNotes ?? ""}
                          maxLength={5_000}
                          className="field mt-2 w-full rounded-lg px-3 py-2.5"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="font-semibold">Equipment status</span>
                        <select
                          name="itemStatus"
                          defaultValue=""
                          className="field mt-2 w-full rounded-lg px-3 py-2.5"
                        >
                          <option value="">
                            Keep current status ({inventoryStatusLabel(ticket.inventoryItem.status)}
                            )
                          </option>
                          {resolutionItemStatuses.map((itemStatus) => (
                            <option key={itemStatus} value={itemStatus}>
                              {inventoryStatusLabel(itemStatus)}
                            </option>
                          ))}
                        </select>
                        <span className="muted mt-1 block text-xs leading-5">
                          {ticket.inventoryItem.status === ItemStatus.DEFECTIVE &&
                          ticket.status === MaintenanceStatus.OPEN
                            ? "Still marked Defective. Set it to Working or OK once fixed."
                            : "Set after checking the item."}
                        </span>
                      </label>
                      <SubmitButton
                        pendingLabel="Saving..."
                        className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                      >
                        Save changes
                      </SubmitButton>
                    </FeedbackForm>
                  </details>
                </div>
              </article>
            ))
          ) : (
            <EmptyState icon={Wrench} title="No requests found.">
              Nothing reported.
            </EmptyState>
          )}
        </section>
        <Pager
          label="Maintenance"
          currentPage={page}
          totalPages={totalPages}
          hrefForPage={pageHref}
        />
      </div>
    </div>
  );
}
