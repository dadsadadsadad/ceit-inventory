import Link from "next/link";

import { ItemStatus } from "@prisma/client";

import { DashboardNoteForm } from "./dashboard-note-form";

import { canManageInventory, requireInventoryAccess } from "@/lib/supabase/server";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [itemCount, locationCount, attentionCount, recentActivity, dashboardNote] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.location.count({ where: { isActive: true } }),
    prisma.inventoryItem.count({ where: { status: ItemStatus.DEFECTIVE } }),
    prisma.inventoryAudit.findMany({ include: { item: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.dashboardNote.findUnique({ where: { scope: "shared-dashboard" } }),
  ]);
  return { attentionCount, dashboardNote, itemCount, locationCount, recentActivity };
}

export default async function DashboardPage() {
  const user = await requireInventoryAccess();
  const canManage = canManageInventory(user.role);
  let dashboard: Awaited<ReturnType<typeof getDashboardData>> | null = null;

  try {
    dashboard = await getDashboardData();
  } catch (error) {
    console.error("Unable to load dashboard", error);
  }

  const cards = dashboard ? [
    { label: "Inventory records", value: dashboard.itemCount.toLocaleString(), detail: "Assets and supply records", href: "/dashboard/inventory" },
    { label: "Active locations", value: dashboard.locationCount.toLocaleString(), detail: "Rooms, labs, and storage areas", href: "/dashboard/settings" },
    { label: "Needs attention", value: dashboard.attentionCount.toLocaleString(), detail: "Defective items", href: "/dashboard/inventory?status=DEFECTIVE" },
  ] : [];

  return (
    <div className="page">
      <div className="page-inner space-y-6">
        <header className="card rounded-lg px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">Overview</p>
              <h1 className="title mt-3 text-3xl sm:text-4xl">Inventory dashboard</h1>
              <p className="muted mt-3 max-w-2xl text-sm leading-6">A live overview of CEIT equipment, supplies, rooms, and records that need a check.</p>
            </div>
            <div className={`connection-status ${dashboard ? "connection-status-online" : "connection-status-offline"} rounded-lg px-4 py-3 text-sm font-medium`} role="status">
              {dashboard ? "Database connected" : "Database unavailable"}
            </div>
          </div>
        </header>

        {dashboard ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Inventory overview">
              {cards.map((stat) => (
                <Link key={stat.label} href={stat.href} className="card card-link rounded-lg p-5">
                  <div className="title text-3xl">{stat.value}</div>
                  <div className="mt-2 text-sm font-semibold">{stat.label}</div>
                  <p className="muted mt-1 text-sm leading-6">{stat.detail}</p>
                </Link>
              ))}
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <article className="card rounded-lg">
                <div className="divider flex items-center justify-between border-b px-6 py-4"><h2 className="text-base font-semibold">Recent activity</h2><Link href="/dashboard/activity" className="accent-link text-sm font-semibold">See all</Link></div>
                {dashboard.recentActivity.length ? (
                  <ol className="divide-y">
                    {dashboard.recentActivity.map((event) => (
                      <li key={event.id} className="flex items-start justify-between gap-4 px-6 py-4">
                        <div><p className="text-sm font-semibold">{event.summary}</p><Link href={`/dashboard/inventory/${event.item.id}`} className="muted mt-1 block text-xs hover:text-[var(--accent)]">{event.item.name}</Link></div>
                        <time className="muted shrink-0 text-xs" dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleDateString()}</time>
                      </li>
                    ))}
                  </ol>
                ) : <p className="muted px-6 py-8 text-sm">Activity will appear here after your first item is added or imported.</p>}
              </article>

              <aside className="card flex min-h-[27rem] flex-col rounded-lg p-6">
                <h2 className="text-base font-semibold">Notes</h2>
                {canManage ? (
                  <DashboardNoteForm initialContent={dashboard.dashboardNote?.content ?? ""} updatedByName={dashboard.dashboardNote?.updatedByName} />
                ) : (
                  <p className="muted mt-5 flex-1 whitespace-pre-wrap text-sm leading-6">{dashboard.dashboardNote?.content || "Add a note here"}</p>
                )}
              </aside>
            </section>
          </>
        ) : <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">The dashboard is temporarily unavailable. Confirm the database connection and refresh this page.</div>}
      </div>
    </div>
  );
}
