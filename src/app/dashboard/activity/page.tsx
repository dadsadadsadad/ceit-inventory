import Link from "next/link";

import { Prisma } from "@prisma/client";

import { requireInventoryAccess } from "@/lib/supabase/server";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

type SearchParams = { page?: string | string[] };
type ActivityEvent = Prisma.InventoryAuditGetPayload<{ include: { item: { select: { id: true; name: true } } } }>;

const pageSize = 25;

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

export default async function ActivityHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireInventoryAccess();
  const search = await searchParams;
  const requestedPage = safePage(search.page);
  let databaseError = false;
  let totalRecords = 0;
  let activity: ActivityEvent[] = [];
  let currentPage = requestedPage;

  try {
    totalRecords = await prisma.inventoryAudit.count();
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(requestedPage, totalPages);
    activity = await prisma.inventoryAudit.findMany({
      include: { item: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    });
  } catch (error) {
    console.error("Unable to load activity history", error);
    databaseError = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return (
    <div className="page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">History</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Activity history</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">Review every recorded inventory change, scan, import, and update.</p>
          </div>
          <Link href="/dashboard" className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Back to dashboard</Link>
        </header>

        {databaseError ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">Activity history could not be loaded. Confirm the database connection and try again.</div>
        ) : activity.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">Activity will appear here after an item is added, changed, scanned, or imported.</div>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="All inventory activity">
            <div className="divider border-b px-5 py-4">
              <p className="muted text-sm">{totalRecords.toLocaleString()} recorded event{totalRecords === 1 ? "" : "s"} · Page {currentPage} of {totalPages}</p>
            </div>

            <ol className="divide-y">
              {activity.map((event) => (
                <li key={event.id} className="px-5 py-5 sm:px-6">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.8fr)_minmax(11rem,0.9fr)] lg:items-start">
                    <div>
                      <span className="status-pill rounded-md px-2.5 py-1 text-xs font-semibold">{actionLabel(event.action)}</span>
                      <p className="mt-3 text-sm font-semibold leading-6">{event.summary}</p>
                      <Link href={`/dashboard/inventory/${event.item.id}`} className="accent-link mt-1 inline-block text-sm font-medium">{event.item.name}</Link>
                    </div>
                    <div className="text-sm">
                      <p className="muted text-xs font-bold uppercase tracking-wide">User</p>
                      <p className="mt-1 break-words font-medium">{actorLabel(event.actorName, event.actorId)}</p>
                    </div>
                    <div className="text-sm lg:text-right">
                      <p className="muted text-xs font-bold uppercase tracking-wide">When</p>
                      <time className="mt-1 block font-medium" dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleString()}</time>
                    </div>
                  </div>
                </li>
              ))}
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
        )}
      </div>
    </div>
  );
}
