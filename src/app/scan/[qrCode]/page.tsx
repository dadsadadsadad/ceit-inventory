import { ItemStatus, ItemType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentInventoryUser, canManageInventory } from "@/lib/inventory-auth";
import { isInventoryQrCode } from "@/lib/qr-code";
import { prisma } from "@/prisma";

import { BorrowReturnChooser } from "../borrow-return-chooser";
import { ScanAuditLogger } from "../scan-audit-logger";

export const dynamic = "force-dynamic";

function readableStatus(status: ItemStatus) {
  return status.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function isBorrowableItem(item: { category: { isActive: boolean }; itemType: ItemType; location: { isActive: boolean }; quantity: number; status: ItemStatus }) {
  return item.itemType === ItemType.ASSET
    && item.quantity > 0
    && item.category.isActive
    && item.location.isActive
    && (item.status === ItemStatus.OK || item.status === ItemStatus.WORKING);
}

export default async function ScannedItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrCode: string }>;
  searchParams: Promise<{ request?: string | string[]; return?: string | string[] }>;
}) {
  const [{ qrCode }, search, user] = await Promise.all([params, searchParams, getCurrentInventoryUser()]);
  if (!isInventoryQrCode(qrCode)) notFound();

  const item = await prisma.inventoryItem.findUnique({
    where: { qrCode },
    select: {
      id: true,
      assetTag: true,
      category: { select: { isActive: true, name: true } },
      condition: true,
      itemType: true,
      location: { select: { isActive: true, name: true } },
      name: true,
      qrCode: true,
      quantity: true,
      status: true,
    },
  });
  if (!item) notFound();

  const canManage = Boolean(user && canManageInventory(user.role));
  const requestSent = (Array.isArray(search.request) ? search.request[0] : search.request) === "sent";
  const returnSent = (Array.isArray(search.return) ? search.return[0] : search.return) === "sent";
  const borrowable = isBorrowableItem(item);

  return (
    <main className="page scan-item-page">
      <ScanAuditLogger itemId={item.id} />
      <div className="page-narrow space-y-6">
        <header>
          <div className="flex items-center justify-between gap-4">
            {canManage ? (
              <Link href="/scan" className="accent-link text-sm font-semibold">Back to scanner</Link>
            ) : (
              <Link href="/auth/login" className="accent-link text-sm font-semibold">Staff sign in</Link>
            )}
            <Link href={canManage ? "/dashboard" : "/"} className="muted text-sm font-semibold hover:text-[var(--accent-strong)]">
              {canManage ? "Dashboard" : "CEIT Inventory"}
            </Link>
          </div>
          <p className="eyebrow mt-5">Scanned item</p>
          <h1 className="title mt-3 text-3xl">{item.name}</h1>
          <p className="muted mt-2 text-sm leading-6">{item.category.name} · {item.location.name}</p>
        </header>

        {requestSent ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Your borrowing request was sent to CEIT staff. Please wait for confirmation before collecting the item.
          </div>
        ) : null}
        {returnSent ? <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">Your return request was sent. Please bring the equipment to CEIT staff for inspection and confirmation.</div> : null}

        <article className="card rounded-lg p-5 sm:p-7">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div><dt className="muted text-xs font-bold uppercase tracking-wide">Asset tag</dt><dd className="mt-1 text-sm font-semibold">{item.assetTag ?? "Not assigned"}</dd></div>
            <div><dt className="muted text-xs font-bold uppercase tracking-wide">Status</dt><dd className="mt-1 text-sm font-semibold">{readableStatus(item.status)}</dd></div>
            <div><dt className="muted text-xs font-bold uppercase tracking-wide">Condition</dt><dd className="mt-1 text-sm font-semibold">{item.condition.replaceAll("_", " ")}</dd></div>
            <div><dt className="muted text-xs font-bold uppercase tracking-wide">Location</dt><dd className="mt-1 text-sm font-semibold">{item.location.name}</dd></div>
          </dl>
        </article>

        {item.itemType === ItemType.ASSET ? <BorrowReturnChooser qrCode={item.qrCode} itemName={item.name} maximumQuantity={item.quantity} borrowable={borrowable} /> : <div className="notice rounded-lg px-5 py-4 text-sm" role="status">This supply item cannot be borrowed or returned through QR requests. Please contact CEIT staff if you need assistance.</div>}

        {canManage ? (
          <section className="card rounded-lg p-5 sm:p-7" aria-labelledby="staff-tools-heading">
            <p className="eyebrow">Staff tools</p>
            <h2 id="staff-tools-heading" className="mt-2 text-xl font-semibold">Update this scanned record</h2>
            <p className="muted mt-2 text-sm leading-6">You are signed in with inventory access. Open the full record to edit item details, hardware, status, and location.</p>
            <Link href={`/dashboard/inventory/${item.id}#edit-record`} className="primary-button mt-5 inline-block rounded-lg px-4 py-2.5 text-sm font-semibold">Open and update item</Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
