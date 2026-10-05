export const metadata = { title: "Maintenance · CEIT Inventory" };

import { OptimisticStatus, OptimisticText } from "@/app/components/optimistic-state";
import { Pager } from "@/app/components/pager";
import Link from "next/link";

import { ItemStatus, MaintenancePriority, MaintenanceStatus, type Prisma } from "@prisma/client";

import { FeedbackForm } from "@/app/components/feedback-form";
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
  itemSearch?: string | string[];
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

// Load reported issues and repair forms.
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
  const itemSearch = firstParam(search.itemSearch)?.trim().slice(0, 120) ?? "";
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
  const [items, requestedTickets, count] = await Promise.all([
    reporting
      ? prisma.inventoryItem.findMany({
          where: {
            status: { not: ItemStatus.RETIRED },
            ...(selectedItem
              ? { id: selectedItem }
              : itemSearch
                ? {
                    OR: [
                      { name: { contains: itemSearch, mode: "insensitive" } },
                      { assetTag: { contains: itemSearch, mode: "insensitive" } },
                      { serialNumber: { contains: itemSearch, mode: "insensitive" } },
                    ],
                  }
                : {}),
          },
          orderBy: [{ name: "asc" }, { assetTag: "asc" }],
          select: { assetTag: true, id: true, name: true },
          take: 51,
        })
      : Promise.resolve([]),
    loadTickets(requestedPage),
    prisma.maintenanceTicket.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / 25));
  const page = Math.min(requestedPage, totalPages);
  const tickets = page === requestedPage ? requestedTickets : await loadTickets(page);
  const reportItems = items.slice(0, 50);

  return (
    <div className="page maintenance-page">
      <div className="page-inner space-y-6">
        {/* Maintenance title and summary. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Maintenance</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Maintenance requests</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Review reported problems and record repairs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

        {/* Create a maintenance request. */}
        {reporting ? (
          <section id="report-issue" className="card scroll-mt-6 rounded-lg p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Report an issue</h2>
              <Link href="/dashboard/maintenance" className="accent-link text-sm font-semibold">
                Close form
              </Link>
            </div>
            {!selectedItem ? (
              <form
                className="mt-4 flex flex-wrap items-end gap-3"
                aria-label="Find equipment for maintenance"
              >
                <input type="hidden" name="report" value="1" />
                <label className="min-w-0 flex-1">
                  <span className="text-sm font-semibold">Find equipment</span>
                  <input
                    name="itemSearch"
                    defaultValue={itemSearch}
                    maxLength={120}
                    className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                    placeholder="Name, asset tag, or serial number"
                  />
                </label>
                <button className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">
                  Find items
                </button>
              </form>
            ) : null}
            {items.length > 50 ? (
              <p className="muted mt-3 text-sm">
                Showing the first 50 matches. Search by name or asset tag to find a specific item.
              </p>
            ) : null}
            {!items.length ? (
              <p className="notice mt-4 rounded-lg px-4 py-3 text-sm">
                No active equipment matches. Try another name or asset tag.
              </p>
            ) : null}
            <FeedbackForm
              action={createMaintenanceTicket}
              createPreview={{ titleField: "title", detailFields: ["itemId", "description"] }}
              className="mt-5 space-y-4"
            >
              <div>
                <p className="muted mt-1 text-sm">
                  Use this when an item needs inspection, repair, or replacement.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-semibold">Inventory item *</span>
                  <select
                    required
                    name="itemId"
                    defaultValue={
                      items.some((item) => item.id === selectedItem) ? selectedItem : ""
                    }
                    className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                  >
                    <option value="" disabled>
                      Select an item
                    </option>
                    {reportItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.assetTag ? ` · ${item.assetTag}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
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
                  placeholder="e.g. Screen does not power on"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Description *</span>
                <textarea
                  required
                  name="description"
                  rows={4}
                  maxLength={5_000}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Describe the fault, damage, or work needed."
                />
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input name="markDefective" type="checkbox" className="h-4 w-4" />
                <span>Mark the item as defective while this request needs attention.</span>
              </label>
              <SubmitButton
                disabled={!reportItems.length}
                pendingLabel="Reporting…"
                className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
              >
                Submit maintenance request
              </SubmitButton>
            </FeedbackForm>
          </section>
        ) : null}

        {/* Filter issues by status, priority, source, and date. Choices apply at once. */}
        <FilterForm
          className="maintenance-filters card grid items-end gap-3 rounded-lg p-4"
          label="Maintenance filters"
        >
          {selectedItem ? <input type="hidden" name="item" value={selectedItem} /> : null}
          <label className="min-w-0 flex-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input
              name="q"
              defaultValue={query}
              maxLength={120}
              placeholder="Issue, details, item, or asset tag"
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
          <ClearFiltersButton className="accent-link text-sm font-semibold">
            Clear all filters
          </ClearFiltersButton>
        </FilterForm>

        {/* Matching maintenance requests. */}
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
                {/* Issue details and repair status. */}
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
                        ? " through a QR code"
                        : ` by ${ticket.reportedByName ?? "Staff"}`}
                    </p>
                    {ticket.resolvedAt ? (
                      <p className="muted mt-1 text-xs">Resolved {formatDate(ticket.resolvedAt)}</p>
                    ) : null}
                  </div>
                  {/* Save inspection results and staff notes. */}
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
                            ? "This equipment is still marked Defective. Choose Working or OK once it has been repaired, otherwise it stays on the needs-attention list."
                            : "Update after inspecting the equipment, or keep its current status."}
                        </span>
                      </label>
                      <SubmitButton
                        pendingLabel="Saving…"
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
            <div className="notice rounded-lg px-5 py-4 text-sm">
              No maintenance requests match this filter.
            </div>
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
