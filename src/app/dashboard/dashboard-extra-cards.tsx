import Link from "next/link";
import {
  BarChart3,
  FileUp,
  PackagePlus,
  Printer,
  ScanLine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { BorrowStatus, ItemStatus, MaintenanceStatus } from "@prisma/client";
import type { ReactNode } from "react";

import { outLoanStatuses } from "@/lib/loan-due";
import { formatManilaDate } from "@/lib/manila-date";
import { formatPesoShort } from "@/lib/reports/format";
import { lowStockWhere } from "@/lib/stock-queries";
import { warrantyWhere } from "@/lib/warranty";
import { prisma } from "@/prisma";

import { Bars } from "./dashboard-charts";

// optional cards, each loads its own data so hidden cards cost nothing

const dayMs = 24 * 60 * 60 * 1000;
const inService = { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } };
const shown = 6;
const day = (date: Date) => formatManilaDate(date, { day: "numeric", month: "short" });
const dayTime = (date: Date) =>
  formatManilaDate(date, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Card({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <article className="card glance-card rounded-lg">
      <div className="section-heading">
        <h2>{title}</h2>
        {link ? (
          <Link href={link.href} className="accent-link text-sm font-semibold">
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
    </article>
  );
}

type Row = {
  id: string;
  href: string;
  title: string;
  detail: string;
  tone?: "critical" | "pending";
};

function MiniList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) {
    return <p className="muted text-sm">{empty}</p>;
  }
  return (
    <ol className="mini-list">
      {rows.map((row) => (
        <li key={row.id} data-tone={row.tone}>
          <Link href={row.href}>{row.title}</Link>
          <small className="muted">{row.detail}</small>
        </li>
      ))}
    </ol>
  );
}

const actions: { href: string; label: string; Icon: LucideIcon; manage?: boolean }[] = [
  { href: "/dashboard/inventory/new", label: "Add item", Icon: PackagePlus, manage: true },
  { href: "/scan", label: "Scan QR code", Icon: ScanLine },
  { href: "/dashboard/inventory/labels", label: "Print labels", Icon: Printer },
  { href: "/dashboard/inventory/import", label: "Import", Icon: FileUp, manage: true },
  { href: "/dashboard/maintenance", label: "Maintenance", Icon: Wrench, manage: true },
  { href: "/dashboard/reports", label: "Reports", Icon: BarChart3 },
];

export function QuickActionsCard({ canManage }: { canManage: boolean }) {
  return (
    <Card title="Quick actions">
      <div className="quick-actions">
        {actions
          .filter((action) => canManage || !action.manage)
          .map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="quick-action">
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          ))}
      </div>
    </Card>
  );
}

export async function OverdueListCard() {
  const now = new Date();
  const loans = await prisma.borrowRequest.findMany({
    where: { status: { in: outLoanStatuses }, expectedReturnDate: { lt: now } },
    select: {
      id: true,
      borrowerName: true,
      expectedReturnDate: true,
      inventoryItem: { select: { name: true } },
    },
    orderBy: { expectedReturnDate: "asc" },
    take: shown,
  });
  return (
    <Card
      title="Overdue loans"
      link={{ href: "/dashboard/borrowing?status=OVERDUE", label: "View all" }}
    >
      <MiniList
        empty="Nothing overdue."
        rows={loans.map((loan) => {
          const days = Math.max(
            1,
            Math.floor((now.getTime() - loan.expectedReturnDate.getTime()) / dayMs),
          );
          return {
            id: loan.id,
            href: "/dashboard/borrowing?status=OVERDUE",
            title: loan.inventoryItem.name,
            detail: `${loan.borrowerName} · ${days} ${days === 1 ? "day" : "days"} late`,
            tone: "critical",
          };
        })}
      />
    </Card>
  );
}

export async function DueSoonCard() {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * dayMs);
  const [returns, pickups] = await Promise.all([
    prisma.borrowRequest.findMany({
      where: { status: { in: outLoanStatuses }, expectedReturnDate: { gte: now, lt: week } },
      select: {
        id: true,
        borrowerName: true,
        expectedReturnDate: true,
        inventoryItem: { select: { name: true } },
      },
      orderBy: { expectedReturnDate: "asc" },
      take: shown,
    }),
    prisma.borrowRequest.findMany({
      where: { status: BorrowStatus.RESERVED, startsAt: { gte: now, lt: week } },
      select: {
        id: true,
        borrowerName: true,
        startsAt: true,
        inventoryItem: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
      take: shown,
    }),
  ]);
  const rows = [
    ...returns.map((loan) => ({
      at: loan.expectedReturnDate,
      row: {
        id: loan.id,
        href: "/dashboard/borrowing?status=BORROWED",
        title: loan.inventoryItem.name,
        detail: `Return · ${loan.borrowerName} · ${dayTime(loan.expectedReturnDate)}`,
      },
    })),
    ...pickups.map((loan) => ({
      at: loan.startsAt,
      row: {
        id: loan.id,
        href: "/dashboard/borrowing?status=RESERVED",
        title: loan.inventoryItem.name,
        detail: `Pickup · ${loan.borrowerName} · ${dayTime(loan.startsAt)}`,
      },
    })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, shown)
    .map((entry) => entry.row);
  return (
    <Card title="Due this week" link={{ href: "/dashboard/borrowing", label: "View all" }}>
      <MiniList rows={rows} empty="Nothing due in the next 7 days." />
    </Card>
  );
}

export async function LowStockListCard() {
  const items = await prisma.inventoryItem.findMany({
    where: lowStockWhere(),
    select: { id: true, name: true, quantity: true },
    orderBy: { quantity: "asc" },
    take: shown,
  });
  return (
    <Card title="Low stock" link={{ href: "/dashboard/inventory?stock=low", label: "View all" }}>
      <MiniList
        empty="Nothing is running low."
        rows={items.map((item) => ({
          id: item.id,
          href: `/dashboard/inventory/${item.id}`,
          title: item.name,
          detail: item.quantity <= 0 ? "Out of stock" : `${item.quantity} left`,
          tone: item.quantity <= 0 ? "critical" : "pending",
        }))}
      />
    </Card>
  );
}

export async function OpenRepairsCard() {
  const tickets = await prisma.maintenanceTicket.findMany({
    where: { status: MaintenanceStatus.OPEN },
    select: {
      id: true,
      title: true,
      priority: true,
      openedAt: true,
      inventoryItem: { select: { id: true, name: true } },
    },
    orderBy: [{ openedAt: "desc" }],
    take: shown,
  });
  return (
    <Card
      title="Open repairs"
      link={{ href: "/dashboard/maintenance?status=OPEN", label: "View all" }}
    >
      <MiniList
        empty="No open repairs."
        rows={tickets.map((ticket) => ({
          id: ticket.id,
          href: `/dashboard/inventory/${ticket.inventoryItem.id}`,
          title: `${ticket.inventoryItem.name}: ${ticket.title}`,
          detail: `${ticket.priority.charAt(0)}${ticket.priority.slice(1).toLowerCase()} · opened ${day(ticket.openedAt)}`,
          tone: ticket.priority === "URGENT" || ticket.priority === "HIGH" ? "critical" : "pending",
        }))}
      />
    </Card>
  );
}

export async function WarrantyListCard() {
  const items = await prisma.inventoryItem.findMany({
    where: { AND: [warrantyWhere("ending"), inService] },
    select: { id: true, name: true, warrantyEndsAt: true },
    orderBy: { warrantyEndsAt: "asc" },
    take: shown,
  });
  return (
    <Card
      title="Warranties ending"
      link={{ href: "/dashboard/inventory?warranty=ending", label: "View all" }}
    >
      <MiniList
        empty="No warranties ending soon."
        rows={items.map((item) => ({
          id: item.id,
          href: `/dashboard/inventory/${item.id}`,
          title: item.name,
          detail: `Ends ${day(item.warrantyEndsAt!)}`,
          tone: "pending",
        }))}
      />
    </Card>
  );
}

export async function LicenseListCard() {
  const now = new Date();
  const licenses = await prisma.computerSoftware.findMany({
    where: {
      licenseExpiresAt: { gte: now, lt: new Date(now.getTime() + 30 * dayMs) },
      computer: { item: inService },
    },
    select: {
      id: true,
      name: true,
      licenseExpiresAt: true,
      computer: { select: { item: { select: { id: true, name: true } } } },
    },
    orderBy: { licenseExpiresAt: "asc" },
    take: shown,
  });
  return (
    <Card
      title="Licenses ending"
      link={{ href: "/dashboard/inventory/software?license=expiring", label: "View all" }}
    >
      <MiniList
        empty="No licenses ending in 30 days."
        rows={licenses.map((entry) => ({
          id: entry.id,
          href: `/dashboard/inventory/${entry.computer.item.id}`,
          title: entry.name,
          detail: `${entry.computer.item.name} · ends ${day(entry.licenseExpiresAt!)}`,
          tone: "pending",
        }))}
      />
    </Card>
  );
}

export async function RecentItemsCard() {
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, assetTag: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: shown,
  });
  return (
    <Card title="Recently added" link={{ href: "/dashboard/inventory", label: "View all" }}>
      <MiniList
        empty="Nothing added yet."
        rows={items.map((item) => ({
          id: item.id,
          href: `/dashboard/inventory/${item.id}`,
          title: item.name,
          detail: [item.assetTag, `added ${day(item.createdAt)}`].filter(Boolean).join(" · "),
        }))}
      />
    </Card>
  );
}

export async function RoomChecksCard() {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * dayMs);
  const pcs = await prisma.inventoryItem.findMany({
    where: { isComputer: true, ...inService },
    select: { lastCheckedAt: true, location: { select: { id: true, name: true } } },
  });
  const rooms = new Map<string, { id: string; name: string; total: number; checked: number }>();
  for (const pc of pcs) {
    const room = rooms.get(pc.location.id) ?? { ...pc.location, total: 0, checked: 0 };
    room.total += 1;
    room.checked += pc.lastCheckedAt && pc.lastCheckedAt >= since ? 1 : 0;
    rooms.set(room.id, room);
  }
  // rooms with the most left to check first
  const list = [...rooms.values()].sort(
    (a, b) => b.total - b.checked - (a.total - a.checked) || a.name.localeCompare(b.name),
  );
  return (
    <Card
      title="Room checks"
      link={{ href: "/dashboard/reports?kind=checks&generate=1", label: "Report" }}
    >
      {list.length ? (
        <ul className="viz-bars">
          {list.slice(0, shown).map((room) => (
            <li key={room.id}>
              <Link
                href={`/dashboard/reports?kind=checks&location=${room.id}&generate=1`}
                className="viz-bar"
              >
                <span className="viz-bar-label">{room.name}</span>
                <b>
                  {room.checked} of {room.total} PCs
                </b>
                <span className="viz-bar-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(room.checked ? 3 : 0, (room.checked / room.total) * 100)}%`,
                    }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">No PCs recorded yet.</p>
      )}
      <p className="viz-caption">Checked in the last 30 days.</p>
    </Card>
  );
}

export async function AssetValueCard() {
  const [groups, categories] = await Promise.all([
    prisma.inventoryItem.groupBy({
      by: ["categoryId"],
      where: { ...inService, purchasePrice: { not: null } },
      _sum: { purchasePrice: true },
    }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);
  const values = groups
    .map((group) => ({
      id: group.categoryId,
      label: categories.find((category) => category.id === group.categoryId)?.name ?? "Category",
      value: Math.round(Number(group._sum.purchasePrice ?? 0)),
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <Card
      title="Asset value"
      link={{ href: "/dashboard/reports?kind=value&generate=1", label: "Report" }}
    >
      <p className="viz-caption">
        <strong>{formatPesoShort(total)}</strong> in use, by category
      </p>
      <Bars
        unit="pesos"
        empty="No prices recorded yet."
        format={formatPesoShort}
        bars={values.slice(0, shown).map((entry) => ({
          ...entry,
          href: `/dashboard/inventory?category=${entry.id}`,
        }))}
      />
    </Card>
  );
}
