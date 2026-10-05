import { ItemStatus, ItemType } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentInventoryUser, canManageInventory } from "@/lib/inventory-auth";
import { canBorrowInventoryStatus } from "@/lib/borrow-availability";
import { borrowPolicyFromEnvironment } from "@/lib/borrow-policy";
import { isHoldLapsed } from "@/lib/borrow-schedule";
import { borrowStatus } from "@/lib/borrow-status";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { formatManilaDate } from "@/lib/manila-date";
import { isInventoryQrCode } from "@/lib/qr-code";
import { prisma } from "@/prisma";

import { BorrowReturnChooser } from "../borrow-return-chooser";
import { ScanAuditLogger } from "../scan-audit-logger";
import { LiveUpdates } from "@/app/components/live-updates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Equipment details · CEIT Inventory" };

function isBorrowableItem(
  item: {
    category: { isActive: boolean };
    itemType: ItemType;
    location: { isActive: boolean };
    status: ItemStatus;
  },
  hasActiveLoan: boolean,
) {
  return (
    item.itemType === ItemType.ASSET &&
    item.category.isActive &&
    item.location.isActive &&
    (canBorrowInventoryStatus(item.status) ||
      (item.status === ItemStatus.DEPLOYED && hasActiveLoan))
  );
}

// Show public item details and available requests.
export default async function ScannedItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrCode: string }>;
  searchParams: Promise<{
    request?: string | string[];
    return?: string | string[];
    issue?: string | string[];
  }>;
}) {
  const [{ qrCode }, search, user] = await Promise.all([
    params,
    searchParams,
    getCurrentInventoryUser(),
  ]);
  if (!isInventoryQrCode(qrCode)) {
    notFound();
  }

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
  if (!item) {
    notFound();
  }

  const canManage = Boolean(user && canManageInventory(user.role));
  const requestSent =
    (Array.isArray(search.request) ? search.request[0] : search.request) === "sent";
  const returnSent = (Array.isArray(search.return) ? search.return[0] : search.return) === "sent";
  const now = new Date();
  const policy = borrowPolicyFromEnvironment();
  const [activeLoans, activeIndividualLoan, bookedRows] = await Promise.all([
    prisma.borrowRequest.aggregate({
      where: {
        inventoryItemId: item.id,
        status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] },
        checkedOutItemStatus: null,
      },
      _sum: { requestedQuantity: true },
    }),
    prisma.borrowRequest.count({
      where: {
        inventoryItemId: item.id,
        status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] },
        checkedOutItemStatus: { not: null },
      },
    }),
    // Only the times are public, never who borrowed the equipment.
    item.itemType === ItemType.ASSET
      ? prisma.borrowRequest.findMany({
          where: {
            inventoryItemId: item.id,
            OR: [
              {
                status: { in: [borrowStatus.REQUESTED, borrowStatus.RESERVED] },
                expectedReturnDate: { gt: now },
              },
              { status: { in: [borrowStatus.BORROWED, borrowStatus.RETURN_REQUESTED] } },
            ],
          },
          select: {
            expectedReturnDate: true,
            isReservation: true,
            requestedAt: true,
            requestedQuantity: true,
            startsAt: true,
            status: true,
          },
          orderBy: { startsAt: "asc" },
          take: 12,
        })
      : Promise.resolve([]),
  ]);
  // Bookings nobody collected or handled in time no longer hold the item.
  const bookedTimes = bookedRows
    .filter((booking) => !isHoldLapsed(booking, now, policy))
    .slice(0, 6);
  const availableQuantity = item.quantity + (activeLoans._sum.requestedQuantity ?? 0);
  const borrowable = isBorrowableItem(item, activeIndividualLoan > 0) && availableQuantity > 0;
  const issueSent = (Array.isArray(search.issue) ? search.issue[0] : search.issue) === "sent";

  return (
    <main className="page scan-item-page">
      <ScanAuditLogger itemId={item.id} />
      <div className="page-narrow space-y-6">
        {/* Scanned item name and navigation. */}
        <header>
          <div className="flex items-center justify-between gap-4">
            {canManage ? (
              <Link href="/scan" className="accent-link text-sm font-semibold">
                Back to scanner
              </Link>
            ) : (
              <Link href="/auth/login" className="accent-link text-sm font-semibold">
                Staff sign in
              </Link>
            )}
            <span className="muted text-sm font-semibold">CEIT Inventory</span>
          </div>
          <p className="eyebrow mt-5">Scanned item</p>
          <h1 className="title mt-3 text-3xl">{item.name}</h1>
          <p className="muted mt-2 text-sm leading-6">
            {item.category.name} · {item.location.name}
          </p>
          <LiveUpdates />
        </header>

        {requestSent ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Your borrowing request was sent to CEIT staff. Please wait for confirmation before
            collecting the item.
          </div>
        ) : null}
        {returnSent ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Your return request was sent. Please bring the equipment to CEIT staff for inspection
            and confirmation.
          </div>
        ) : null}
        {issueSent ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Your issue report was sent. CEIT staff will review it.
          </div>
        ) : null}

        {/* Public item details. */}
        <article className="card rounded-lg p-5 sm:p-7">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="muted text-xs font-bold uppercase tracking-wide">Asset tag</dt>
              <dd className="mt-1 font-mono text-sm font-semibold">
                {item.assetTag ?? "Not assigned"}
              </dd>
            </div>
            <div>
              <dt className="muted text-xs font-bold uppercase tracking-wide">Status</dt>
              <dd className="mt-1 text-sm font-semibold">{inventoryStatusLabel(item.status)}</dd>
            </div>
            <div>
              <dt className="muted text-xs font-bold uppercase tracking-wide">Condition</dt>
              <dd className="mt-1 text-sm font-semibold">{inventoryStatusLabel(item.condition)}</dd>
            </div>
            <div>
              <dt className="muted text-xs font-bold uppercase tracking-wide">Location</dt>
              <dd className="mt-1 text-sm font-semibold">{item.location.name}</dd>
            </div>
          </dl>
        </article>

        {bookedTimes.length ? (
          <section className="card rounded-lg p-5 sm:p-7" aria-labelledby="booked-times-heading">
            <h2 id="booked-times-heading" className="text-base font-semibold">
              When this item is not available
            </h2>
            <p className="muted mt-1 text-sm leading-6">
              Choose a pickup and return time outside these periods. All times are Philippine time.
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {bookedTimes.map((booking, index) => {
                const inUse =
                  booking.status === borrowStatus.BORROWED ||
                  booking.status === borrowStatus.RETURN_REQUESTED;
                const late = inUse && booking.expectedReturnDate <= now;
                return (
                  <li key={index} className="divider border-l pl-3">
                    <p className="font-semibold">{inUse ? "In use" : "Booked"}</p>
                    <p className="muted mt-0.5">
                      {late
                        ? "Past its return time, waiting for staff to confirm the return."
                        : `${inUse ? "Until " : `${formatManilaDate(booking.startsAt, { dateStyle: "medium", timeStyle: "short" })} to `}${formatManilaDate(booking.expectedReturnDate, { dateStyle: "medium", timeStyle: "short" })}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Public borrowing, return, and issue-report forms. */}
        <BorrowReturnChooser
          policy={{
            maximumAdvanceDays: policy.maximumAdvanceDays,
            maximumLoanDays: policy.maximumLoanDays,
          }}
          key={`${qrCode}-${requestSent}-${returnSent}-${issueSent}`}
          qrCode={item.qrCode}
          itemName={item.name}
          maximumQuantity={availableQuantity}
          borrowable={borrowable}
          isAsset={item.itemType === ItemType.ASSET}
          canReport={item.status !== ItemStatus.RETIRED}
        />

        {canManage ? (
          <div className="text-center">
            <Link
              href={`/dashboard/inventory/${item.id}?edit=1#edit-record`}
              className="accent-link inline-flex px-4 py-2.5 text-sm font-semibold"
            >
              Edit item record
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
