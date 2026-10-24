import { ItemStatus, type Prisma } from "@prisma/client";

import { inventoryWhere } from "@/lib/record-search";
import { prisma } from "@/prisma";

import { chips, formatLastChecked, formatReportDateTime, plural } from "../format";
import type { ReportModel } from "../model";
import { filterNames, type BuilderContext } from "./shared";

const dayMs = 24 * 60 * 60 * 1000;
const defaultWindow = 30;

type Room = {
  name: string;
  pcs: number;
  pcsChecked: number;
  others: number;
  othersChecked: number;
  last: Date | null;
};

const percent = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "-";

// pcs have to be checked every round, other equipment is optional
export async function buildChecksReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const days = filters.within ?? defaultWindow;
  const since = new Date(now.getTime() - days * dayMs);
  const where: Prisma.InventoryItemWhereInput = {
    AND: [
      inventoryWhere({ location: filters.locationId, q: filters.query }),
      { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } },
      ...(filters.pcOnly ? [{ isComputer: true }] : []),
    ],
  };
  const [items, names] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      select: {
        name: true,
        assetTag: true,
        isComputer: true,
        lastCheckedAt: true,
        location: { select: { name: true } },
      },
      orderBy: [{ location: { name: "asc" } }, { name: "asc" }],
      take: 20_000,
    }),
    filterNames(filters),
  ]);

  const checked = (date: Date | null) => Boolean(date && date >= since);
  const rooms = new Map<string, Room>();
  for (const item of items) {
    const room = rooms.get(item.location.name) ?? {
      name: item.location.name,
      pcs: 0,
      pcsChecked: 0,
      others: 0,
      othersChecked: 0,
      last: null,
    };
    if (item.isComputer) {
      room.pcs += 1;
      room.pcsChecked += checked(item.lastCheckedAt) ? 1 : 0;
    } else {
      room.others += 1;
      room.othersChecked += checked(item.lastCheckedAt) ? 1 : 0;
    }
    if (item.lastCheckedAt && (!room.last || item.lastCheckedAt > room.last)) {
      room.last = item.lastCheckedAt;
    }
    rooms.set(room.name, room);
  }
  const roomList = [...rooms.values()];
  const pcs = items.filter((item) => item.isComputer);
  const pcsDue = pcs.filter((item) => !checked(item.lastCheckedAt));
  const others = items.filter((item) => !item.isComputer);
  const othersChecked = others.filter((item) => checked(item.lastCheckedAt)).length;
  const roomsDone = roomList.filter((room) => room.pcs && room.pcsChecked === room.pcs).length;
  const roomsWithPcs = roomList.filter((room) => room.pcs).length;
  const latest = items
    .filter((item) => checked(item.lastCheckedAt))
    .sort((a, b) => b.lastCheckedAt!.getTime() - a.lastCheckedAt!.getTime());
  const label = (item: (typeof items)[number]) =>
    [item.name, item.assetTag].filter(Boolean).join("\n");

  return {
    kind: "checks",
    title: "Room checks",
    description: `What was checked in the last ${days} days, room by room. PCs need a check every round.`,
    filters: chips(
      filters.query && `Search: "${filters.query}"`,
      names.location && `Room: ${names.location}`,
      `Checked within ${days} days`,
      filters.pcOnly && "PCs only",
    ),
    generatedAt: now,
    metrics: [
      {
        label: "PCs checked",
        value: percent(pcs.length - pcsDue.length, pcs.length),
        note: `${pcs.length - pcsDue.length} of ${pcs.length}`,
        tone: pcsDue.length ? "alert" : undefined,
      },
      {
        label: "Rooms done",
        value: `${roomsDone} of ${roomsWithPcs}`,
        note: "every PC checked",
      },
      ...(filters.pcOnly
        ? []
        : [
            {
              label: "Other equipment checked",
              value: percent(othersChecked, others.length),
              note: `${othersChecked} of ${others.length}, optional`,
            },
          ]),
      {
        label: "Last check",
        value: latest[0] ? formatReportDateTime(latest[0].lastCheckedAt) : "-",
      },
    ],
    charts: [
      {
        title: "PCs left to check",
        kind: "bars",
        unit: "PCs",
        note: `Rooms with PCs not checked in ${days} days.`,
        data: roomList
          .filter((room) => room.pcs > room.pcsChecked)
          .map((room) => ({
            label: room.name,
            value: room.pcs - room.pcsChecked,
            tone: "not_tested" as const,
          })),
      },
    ],
    tables: [
      {
        heading: "Rooms",
        columns: [
          { label: "Room", width: 1.6, primary: true },
          { label: "PCs checked", width: 1, align: "right" },
          { label: "Other equipment checked", width: 1.2, align: "right" },
          { label: "Last check", width: 1.2 },
        ],
        tones: roomList.map((room) =>
          room.pcs && room.pcsChecked < room.pcs ? "not_tested" : room.pcs ? "ok" : undefined,
        ),
        rows: roomList.map((room) => [
          room.name,
          room.pcs ? `${room.pcsChecked} of ${room.pcs}` : "No PCs",
          room.others ? `${room.othersChecked} of ${room.others}` : "-",
          formatReportDateTime(room.last),
        ]),
        total: roomList.length,
        emptyText: "No rooms with equipment.",
      },
      {
        heading: `PCs not checked in ${days} days`,
        note: pcsDue.length ? `${plural(pcsDue.length, "PC")} still to check.` : undefined,
        columns: [
          { label: "PC", width: 1.8, primary: true },
          { label: "Room", width: 1.2 },
          { label: "Last checked", width: 1.2 },
        ],
        tones: pcsDue.map((item) => (item.lastCheckedAt ? "not_tested" : "defective")),
        rows: pcsDue.map((item) => [
          label(item),
          item.location.name,
          formatLastChecked(item.lastCheckedAt),
        ]),
        total: pcsDue.length,
        emptyText: "Every PC has been checked.",
      },
      {
        heading: "Latest checks",
        columns: [
          { label: "Item", width: 1.8, primary: true },
          { label: "Room", width: 1.2 },
          { label: "Checked", width: 1.2 },
        ],
        rows: latest.map((item) => [
          `${label(item)}${item.isComputer ? "\nPC" : ""}`,
          item.location.name,
          formatReportDateTime(item.lastCheckedAt),
        ]),
        total: latest.length,
        emptyText: `Nothing checked in the last ${days} days.`,
      },
    ],
    csv: [
      ["Asset tag", "Item", "Room", "PC", "Last checked", `Checked within ${days} days`],
      ...items.map((item) => [
        item.assetTag,
        item.name,
        item.location.name,
        item.isComputer ? "Yes" : "No",
        item.lastCheckedAt,
        checked(item.lastCheckedAt) ? "Yes" : "No",
      ]),
    ],
  };
}
