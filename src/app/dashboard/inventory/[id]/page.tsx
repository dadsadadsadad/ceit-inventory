export const metadata = { title: "Item record · CEIT Inventory" };

import Link from "next/link";
import { notFound } from "next/navigation";

import { OptimisticText } from "@/app/components/optimistic-state";
import { isUuid } from "@/lib/ids";
import {
  canManageAdministration,
  canManageInventory,
  requireInventoryAccess,
} from "@/lib/inventory-auth";
import { firstParam, type RawParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { ComputerSection } from "./_components/computer-profile";
import { ItemEditPanel } from "./_components/item-edit-panel";
import { ItemHistory } from "./_components/item-history";
import { itemRecordInclude } from "./_components/item-record";
import { ItemSummary } from "./_components/item-summary";

export const dynamic = "force-dynamic";

// Load one item with its history and editing forms.
export default async function InventoryItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: RawParam }>;
}) {
  const user = await requireInventoryAccess();
  const canManage = canManageInventory(user.role);
  const canDelete = canManageAdministration(user.role);
  const { id } = await params;
  const search = await searchParams;
  if (!isUuid(id)) {
    notFound();
  }

  const [item, categories, locations] = await Promise.all([
    prisma.inventoryItem.findUnique({ where: { id }, include: itemRecordInclude }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!item) {
    notFound();
  }

  return (
    <div className="page item-detail-page">
      <div className="page-inner space-y-6">
        {/* Item title, status, and label links. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">
              ← Inventory
            </Link>
            <p className="eyebrow mt-5">Inventory record</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">
              <OptimisticText entity={`item:${item.id}`} field="name">
                {item.name}
              </OptimisticText>
            </h1>
            <p className="muted mt-2 text-sm">
              {item.assetTag ? `Asset tag: ${item.assetTag}` : `QR code: ${item.qrCode}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canManage ? (
              <Link
                href={`/dashboard/inventory/${item.id}?edit=1#edit-record`}
                className="primary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
              >
                Edit record
              </Link>
            ) : null}
            {canManage ? (
              <Link
                href={`/dashboard/maintenance?item=${item.id}`}
                className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
              >
                Report an issue
              </Link>
            ) : null}
            <Link
              href={`/dashboard/inventory/${item.id}/label`}
              className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
            >
              Print QR code
            </Link>
          </div>
        </header>

        <div className="item-record-layout grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-6">
            <ItemSummary item={item} />
            <ComputerSection item={item} canManage={canManage} />
            <ItemHistory item={item} />
          </div>

          {canManage ? (
            <ItemEditPanel
              item={item}
              categories={categories}
              locations={locations}
              canDelete={canDelete}
              open={firstParam(search.edit) === "1"}
            />
          ) : (
            <aside className="notice h-fit rounded-lg px-5 py-4 text-sm">
              You have read-only access to this item.
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
