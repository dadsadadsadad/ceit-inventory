import { ItemStatus, ItemType } from "@prisma/client";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentInventoryUser, canManageInventory } from "@/lib/inventory-auth";
import { canBorrowInventoryStatus } from "@/lib/borrow-availability";
import { borrowPolicyFromEnvironment } from "@/lib/borrow-policy";
import {
  availableScheduledQuantity,
  isHoldLapsed,
  manilaDateTimeInput,
  type ScheduledLoan,
} from "@/lib/borrow-schedule";
import { borrowStatus } from "@/lib/borrow-status";
import { issueFormToken } from "@/lib/form-token";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { formatManilaDate } from "@/lib/manila-date";
import { isInventoryQrCode } from "@/lib/qr-code";
import { firstParam, type RawParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import {
  BorrowReturnChooser,
  type ItemAvailability,
  type RequestMode,
} from "../borrow-return-chooser";
import { ScanAuditLogger } from "../scan-audit-logger";
import { LiveUpdates } from "@/app/components/live-updates";
import { humanizeEnum } from "@/lib/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Equipment details · CEIT Inventory" };

const halfHourMs = 30 * 60 * 1000;
const requestModes: RequestMode[] = ["borrow", "return", "issue"];

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

// can it be borrowed now or only reserved, and when is it free next
function availabilityFor(
  borrowable: boolean,
  capacity: number,
  loans: ScheduledLoan[],
  now: Date,
  policy: ReturnType<typeof borrowPolicyFromEnvironment>,
): ItemAvailability {
  if (!borrowable) {
    return { freeFrom: null, state: "closed" };
  }
  const freeAt = (at: Date) =>
    availableScheduledQuantity(
      capacity,
      loans,
      at,
      new Date(at.getTime() + halfHourMs),
      now,
      policy,
    ) > 0;
  if (freeAt(now)) {
    return { freeFrom: null, state: "now" };
  }
  const endings = loans
    .map((loan) => loan.expectedReturnDate)
    .filter((end) => end > now)
    .sort((a, b) => a.getTime() - b.getTime());
  const free = endings.find(freeAt);
  return { freeFrom: free ? manilaDateTimeInput(free) : null, state: "later" };
}

export default async function ScannedItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrCode: string }>;
  searchParams: Promise<{
    issue?: RawParam;
    mode?: RawParam;
    request?: RawParam;
    return?: RawParam;
    view?: RawParam;
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
  const requestSent = firstParam(search.request) === "sent";
  const returnSent = firstParam(search.return) === "sent";
  const issueSent = firstParam(search.issue) === "sent";
  const publicView = firstParam(search.view) === "public";
  // signed in staff go to the edit page, ?view=public keeps them here
  if (canManage && !publicView && !requestSent && !returnSent && !issueSent) {
    redirect(`/dashboard/inventory/${item.id}?edit=1&scanned=1#edit-record`);
  }
  const requestedMode = firstParam(search.mode) as RequestMode | undefined;
  const initialMode = requestedMode && requestModes.includes(requestedMode) ? requestedMode : null;

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
    // only times, never who borrowed it
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
  // lapsed bookings don't hold the item
  const liveBookings = bookedRows.filter((booking) => !isHoldLapsed(booking, now, policy));
  const bookedTimes = liveBookings.slice(0, 6);
  const availableQuantity = item.quantity + (activeLoans._sum.requestedQuantity ?? 0);
  const borrowable = isBorrowableItem(item, activeIndividualLoan > 0) && availableQuantity > 0;
  const availability = availabilityFor(borrowable, availableQuantity, liveBookings, now, policy);
  const isAsset = item.itemType === ItemType.ASSET;
  // a return request was already sent once it shows as return pending
  const canReturn = liveBookings.some((booking) => booking.status === borrowStatus.BORROWED);
  const freeFromDate = availability.freeFrom ? new Date(`${availability.freeFrom}:00+08:00`) : null;

  const formTokens = {
    borrow: issueFormToken(`borrow:${item.qrCode}`),
    issue: issueFormToken(`issue:${item.qrCode}`),
    return: issueFormToken(`return:${item.qrCode}`),
  };

  return (
    <main className="page scan-item-page">
      <ScanAuditLogger itemId={item.id} />
      <div className="page-narrow space-y-6">
        <header>
          <div className="flex items-center justify-between gap-4">
            {canManage ? (
              <Link
                href={`/dashboard/inventory/${item.id}?edit=1&scanned=1#edit-record`}
                className="accent-link text-sm font-semibold"
              >
                ← Item record
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
            Request sent. Wait for CEIT staff to confirm before picking it up.
          </div>
        ) : null}
        {returnSent ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Return request sent. Bring the item to CEIT staff.
          </div>
        ) : null}
        {issueSent ? (
          <div className="notice notice-success rounded-lg px-5 py-4 text-sm" role="status">
            Report sent. Thanks!
          </div>
        ) : null}

        {isAsset ? (
          <div className={`availability-banner availability-${availability.state} rounded-lg`}>
            {availability.state === "now" ? (
              <CircleCheck size={22} aria-hidden="true" />
            ) : availability.state === "later" ? (
              <Clock size={22} aria-hidden="true" />
            ) : (
              <CircleAlert size={22} aria-hidden="true" />
            )}
            <div>
              <p className="availability-title">
                {availability.state === "now"
                  ? "Available now"
                  : availability.state === "later"
                    ? "In use right now"
                    : "Not available to borrow"}
              </p>
              <p className="availability-detail">
                {availability.state === "now"
                  ? "You can borrow it now or reserve it."
                  : availability.state === "later"
                    ? freeFromDate
                      ? `Expected back ${formatManilaDate(freeFromDate, { dateStyle: "medium", timeStyle: "short" })}. You can reserve it for after that.`
                      : "It's overdue. You can still reserve it for later."
                    : item.status === ItemStatus.RETIRED
                      ? "This item is retired."
                      : `Its status is ${inventoryStatusLabel(item.status).toLowerCase()}. Ask CEIT staff if you need it.`}
              </p>
            </div>
          </div>
        ) : null}

        <article className="card rounded-lg p-5 sm:p-7">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="detail-wide-phone">
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
              <dd className="mt-1 text-sm font-semibold">{humanizeEnum(item.condition)}</dd>
            </div>
            <div>
              <dt className="muted text-xs font-bold uppercase tracking-wide">Room</dt>
              <dd className="mt-1 text-sm font-semibold">{item.location.name}</dd>
            </div>
          </dl>
        </article>

        {bookedTimes.length ? (
          <section className="card rounded-lg p-5 sm:p-7" aria-labelledby="booked-times-heading">
            <h2 id="booked-times-heading" className="text-base font-semibold">
              Booked times
            </h2>
            <p className="muted mt-1 text-sm leading-6">
              Pick a time outside these. Times are in PH time.
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
                        ? "Overdue, waiting for return."
                        : `${inUse ? "Until " : `${formatManilaDate(booking.startsAt, { dateStyle: "medium", timeStyle: "short" })} to `}${formatManilaDate(booking.expectedReturnDate, { dateStyle: "medium", timeStyle: "short" })}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <BorrowReturnChooser
          availability={availability}
          formTokens={formTokens}
          initialMode={initialMode}
          policy={{
            maxAdvanceDays: policy.maxAdvanceDays,
            maxLoanDays: policy.maxLoanDays,
          }}
          key={`${qrCode}-${requestSent}-${returnSent}-${issueSent}`}
          qrCode={item.qrCode}
          itemName={item.name}
          maxQuantity={availableQuantity}
          isAsset={isAsset}
          canReport={item.status !== ItemStatus.RETIRED}
          canReturn={canReturn}
        />
      </div>
    </main>
  );
}
