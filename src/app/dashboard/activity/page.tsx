import Link from "next/link";

import { AuditAction, Prisma } from "@prisma/client";

import { requireInventoryAccess } from "@/lib/inventory-auth";
import { formatManilaDate } from "@/lib/manila-date";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string | string[] };
type ActivityEvent = Prisma.InventoryAuditGetPayload<{ include: { item: { select: { id: true; name: true } } } }>;
type ActivityCategory = "record-edit" | "record-created" | "import" | "scan" | "label" | "borrowing" | "maintenance" | "attachment" | "other";

const pageSize = 25;
const recentEditCandidateLimit = 50;
const recordChangeActions: AuditAction[] = [AuditAction.UPDATED, AuditAction.MOVED, AuditAction.STATUS_CHANGED];

function safePage(value?: string | string[]) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function pageLink(page: number) {
  return page > 1 ? `/dashboard/activity?page=${page}` : "/dashboard/activity";
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

function actionLabel(action: string) {
  return action.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function actorLabel(actorName: string | null, actorId: string | null) {
  const savedName = actorName?.trim();
  if (savedName) return savedName;
  return actorId ? "Former user" : "System";
}

function metadataFor(event: ActivityEvent): Prisma.JsonObject {
  const metadata = event.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Prisma.JsonObject : {};
}

function metadataText(metadata: Prisma.JsonObject, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function hasMetadataValue(metadata: Prisma.JsonObject, key: string) {
  return metadata[key] !== undefined && metadata[key] !== null;
}

function changedFields(event: ActivityEvent) {
  const changes = metadataFor(event).changes;
  return changes && typeof changes === "object" && !Array.isArray(changes) ? Object.keys(changes) : [];
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    assetTag: "asset tag",
    categoryId: "category",
    itemType: "item type",
    locationId: "location",
    purchaseDate: "purchase date",
    purchasePrice: "purchase price",
    serialNumber: "serial number",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function activityCategory(event: ActivityEvent): ActivityCategory {
  const metadata = metadataFor(event);
  const activityKind = metadataText(metadata, "activityKind");
  const source = metadataText(metadata, "source");

  if (activityKind === "label-print" || source === "qr-label") return "label";
  if (event.action === AuditAction.SCANNED || activityKind === "scan" || source === "qr") return "scan";
  if (source === "import" || activityKind === "record-import") return "import";
  if (hasMetadataValue(metadata, "borrowRequestId")) return "borrowing";
  if (hasMetadataValue(metadata, "maintenanceTicketId") || source === "maintenance") return "maintenance";
  if (source === "photo-upload" || source === "photo-delete") return "attachment";
  if (activityKind === "record-edit") return "record-edit";
  if (activityKind === "record-create") return "record-created";
  if (event.action === AuditAction.CREATED) return "record-created";
  if (recordChangeActions.includes(event.action)) return "record-edit";
  return "other";
}

function categoryLabel(category: ActivityCategory) {
  const labels: Record<ActivityCategory, string> = {
    "record-edit": "Record edit",
    "record-created": "Record added",
    import: "Import",
    scan: "Scan",
    label: "QR label",
    borrowing: "Borrowing",
    maintenance: "Maintenance",
    attachment: "Item media",
    other: "Other activity",
  };
  return labels[category];
}

function eventDetail(event: ActivityEvent) {
  const metadata = metadataFor(event);
  const fields = changedFields(event);
  if (fields.length) {
    const visibleFields = fields.slice(0, 3).map(fieldLabel);
    const remainingCount = fields.length - visibleFields.length;
    return `Changed ${visibleFields.join(", ")}${remainingCount > 0 ? `, and ${remainingCount} more` : ""}.`;
  }

  const bulkAction = metadataText(metadata, "bulkAction");
  if (bulkAction) return `Bulk ${fieldLabel(bulkAction)} update.`;

  switch (activityCategory(event)) {
    case "record-edit":
      return "Inventory record updated.";
    case "record-created":
      return "New inventory record added.";
    case "import":
      return "Created from an inventory file.";
    case "scan":
      return metadataText(metadata, "scanType") === "public" ? "QR label opened from a public device." : "QR label opened by staff.";
    case "label":
      return "QR label printed for physical use.";
    case "borrowing":
      return "Borrowing workflow updated this item.";
    case "maintenance":
      return "Maintenance workflow updated this item.";
    case "attachment":
      return "Item media was updated.";
    default:
      return null;
  }
}

function formattedTimestamp(value: Date) {
  return formatManilaDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export default async function ActivityHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireInventoryAccess();
  const search = await searchParams;
  const requestedPage = safePage(search.page);
  let databaseError = false;
  let totalRecords = 0;
  let activity: ActivityEvent[] = [];
  let recentEdits: ActivityEvent[] = [];
  let currentPage = requestedPage;

  try {
    const [activityCount, editCandidates] = await Promise.all([
      prisma.inventoryAudit.count(),
      prisma.inventoryAudit.findMany({
        include: { item: { select: { id: true, name: true } } },
        where: { action: { in: recordChangeActions } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: recentEditCandidateLimit,
      }),
    ]);
    totalRecords = activityCount;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    activity = await prisma.inventoryAudit.findMany({
      include: { item: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
    recentEdits = editCandidates.filter((event) => activityCategory(event) === "record-edit").slice(0, 5);
  } catch (error) {
    console.error("Unable to load activity history", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return (
    <div className="page activity-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">History</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Activity history</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">Review item edits separately from scans, imports, borrowing, maintenance, and other inventory activity.</p>
          </div>
          <Link href="/dashboard" className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Back to dashboard</Link>
        </header>

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">Activity history could not be loaded. Confirm the database connection and try again.</div>
        ) : activity.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">Activity will appear here after an item is added, changed, scanned, or imported.</div>
        ) : (
          <>
            <section className="card overflow-hidden rounded-lg" aria-label="Recent inventory record edits">
              <div className="divider flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="eyebrow">Recently edited</p>
                  <h2 className="mt-1 text-lg font-semibold">Latest record changes</h2>
                </div>
                <p className="muted text-sm">Scans and workflow events are kept out of this list.</p>
              </div>

              {recentEdits.length ? (
                <ol className="divide-y">
                  {recentEdits.map((event) => {
                    const detail = eventDetail(event);
                    return (
                      <li key={event.id} className="px-5 py-5 sm:px-6">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.85fr)] lg:items-start">
                          <div>
                            <span className="status-pill rounded-md px-2.5 py-1 text-xs font-semibold">Record edit</span>
                            <p className="mt-3 text-sm font-semibold leading-6">{event.summary}</p>
                            {detail ? <p className="muted mt-1 text-sm leading-6">{detail}</p> : null}
                          </div>
                          <div className="text-sm lg:text-right">
                            <Link href={`/dashboard/inventory/${event.item.id}`} className="accent-link break-words font-semibold">{event.item.name}</Link>
                            <p className="muted mt-1">Edited by {actorLabel(event.actorName, event.actorId)}</p>
                            <time className="muted mt-1 block text-xs" dateTime={event.createdAt.toISOString()}>{formattedTimestamp(event.createdAt)}</time>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="muted px-5 py-7 text-sm leading-6">No direct inventory record edits have been recorded yet. Scans, imports, and workflow changes will still appear in the complete history below.</p>}
            </section>

            <section className="card overflow-hidden rounded-lg" aria-label="All inventory activity">
              <div className="divider flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="eyebrow">Complete timeline</p>
                  <h2 className="mt-1 text-lg font-semibold">All inventory activity</h2>
                </div>
                <p className="muted text-sm">{totalRecords.toLocaleString()} recorded event{totalRecords === 1 ? "" : "s"} · Page {currentPage} of {totalPages}</p>
              </div>

              <ol className="divide-y">
                {activity.map((event) => {
                  const category = activityCategory(event);
                  const detail = eventDetail(event);
                  return (
                    <li key={event.id} className="px-5 py-5 sm:px-6">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.8fr)_minmax(11rem,0.9fr)] lg:items-start">
                        <div>
                          <div className="flex flex-wrap gap-2"><span className="status-pill rounded-md px-2.5 py-1 text-xs font-semibold">{categoryLabel(category)}</span><span className="card-muted rounded-md px-2.5 py-1 text-xs font-semibold">{actionLabel(event.action)}</span></div>
                          <p className="mt-3 text-sm font-semibold leading-6">{event.summary}</p>
                          {detail ? <p className="muted mt-1 text-sm leading-6">{detail}</p> : null}
                          <Link href={`/dashboard/inventory/${event.item.id}`} className="accent-link mt-2 inline-block text-sm font-medium">{event.item.name}</Link>
                        </div>
                        <div className="text-sm">
                          <p className="muted text-xs font-bold uppercase tracking-wide">User</p>
                          <p className="mt-1 break-words font-medium">{actorLabel(event.actorName, event.actorId)}</p>
                        </div>
                        <div className="text-sm lg:text-right">
                          <p className="muted text-xs font-bold uppercase tracking-wide">When</p>
                          <time className="mt-1 block font-medium" dateTime={event.createdAt.toISOString()}>{formattedTimestamp(event.createdAt)}</time>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {totalPages > 1 ? (
                <nav className="divider flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" aria-label="Activity history pages">
                  {currentPage > 1 ? <Link href={pageLink(currentPage - 1)} className="pagination-link px-3 text-sm font-semibold">← Previous</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">← Previous</span>}
                  <div className="order-3 flex w-full items-center justify-center gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0" aria-label="Choose activity history page">
                    {paginationEntries(totalPages, currentPage).map((entry, index) => entry === null ? (
                      <span key={`gap-${index}`} className="muted px-1 text-sm" aria-hidden="true">…</span>
                    ) : entry === currentPage ? (
                      <span key={entry} className="pagination-current text-sm font-semibold" aria-current="page">{entry}</span>
                    ) : (
                      <Link key={entry} href={pageLink(entry)} className="pagination-link text-sm font-semibold" aria-label={`Go to page ${entry}`}>{entry}</Link>
                    ))}
                  </div>
                  {currentPage < totalPages ? <Link href={pageLink(currentPage + 1)} className="pagination-link px-3 text-sm font-semibold">Next →</Link> : <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">Next →</span>}
                </nav>
              ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
