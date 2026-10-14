import { ItemStatus, ItemType, type Prisma } from "@prisma/client";

import { inspectionIntervalDays } from "@/lib/inventory-attention";
import { missingDetails, type MissingDetail } from "@/lib/report-export-filters";
import { inventoryWhere } from "@/lib/record-search";
import { prisma } from "@/prisma";

import { chips, formatReportDateTime } from "../format";
import type { ReportModel } from "../model";
import { missingDetailLabels, missingWhere } from "./item-filters";
import { filterNames, loadCapped, type BuilderContext } from "./shared";

const dayMs = 24 * 60 * 60 * 1000;

type HealthRecord = {
  _count: { photos: number };
  computer: { memoryGb: number | null; processor: string | null; storageGb: number | null } | null;
  isComputer: boolean;
  itemType: ItemType;
  lastCheckedAt: Date | null;
  purchaseDate: Date | null;
  purchasePrice: unknown;
  serialNumber: string | null;
  warrantyEndsAt: Date | null;
};

/** The details one record is missing, using the same rules as the filters. */
export function recordGaps(item: HealthRecord, now: Date): MissingDetail[] {
  const stale = now.getTime() - inspectionIntervalDays * dayMs;
  const checks: Record<MissingDetail, boolean> = {
    price: item.purchasePrice === null,
    purchaseDate: item.purchaseDate === null,
    serial: item.itemType === ItemType.ASSET && !item.serialNumber,
    warranty: item.itemType === ItemType.ASSET && !item.warrantyEndsAt,
    photo: item._count.photos === 0,
    inspection: !item.lastCheckedAt || item.lastCheckedAt.getTime() < stale,
    pcDetails:
      item.isComputer &&
      (!item.computer ||
        item.computer.processor === null ||
        item.computer.memoryGb === null ||
        item.computer.storageGb === null),
  };
  return missingDetails.filter((detail) => checks[detail]);
}

// What is missing from the register, so records can be completed before an audit.
export async function buildHealthReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  // Retired and lost records are kept for history; they are not expected to be completed.
  const base: Prisma.InventoryItemWhereInput = {
    AND: [
      inventoryWhere({
        category: filters.categoryId,
        itemType: filters.itemType,
        location: filters.locationId,
        q: filters.query,
      }),
      { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } },
    ],
  };
  const anyGap: Prisma.InventoryItemWhereInput = {
    OR: missingDetails.map((detail) => missingWhere(detail, now)),
  };
  const where: Prisma.InventoryItemWhereInput = {
    AND: [base, filters.missing ? missingWhere(filters.missing, now) : anyGap],
  };

  const [{ rows: items, total }, everything, gapCounts, names] = await Promise.all([
    loadCapped(context, {
      find: (take) =>
        prisma.inventoryItem.findMany({
          where,
          include: {
            category: true,
            location: true,
            computer: { select: { processor: true, memoryGb: true, storageGb: true } },
            _count: { select: { photos: true } },
          },
          orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
          take,
        }),
      count: () => prisma.inventoryItem.count({ where }),
    }),
    prisma.inventoryItem.count({ where: base }),
    Promise.all(
      missingDetails.map((detail) =>
        prisma.inventoryItem.count({ where: { AND: [base, missingWhere(detail, now)] } }),
      ),
    ),
    filterNames(filters),
  ]);
  const incomplete = filters.missing
    ? await prisma.inventoryItem.count({ where: { AND: [base, anyGap] } })
    : total;
  const complete = everything - incomplete;

  return {
    kind: "health",
    title: "Record health",
    description: "What is missing from each record, so the register can be completed.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      names.category && `Category: ${names.category}`,
      names.location && `Room: ${names.location}`,
      filters.itemType && `Type: ${filters.itemType === "ASSET" ? "Equipment" : "Stock"}`,
      filters.missing && missingDetailLabels[filters.missing],
    ),
    generatedAt: now,
    metrics: [
      {
        label: "Complete records",
        value: everything ? `${Math.round((complete / everything) * 100)}%` : "–",
        note: `${complete.toLocaleString()} of ${everything.toLocaleString()} in use`,
      },
      ...missingDetails.map((detail, index) => ({
        label: missingDetailLabels[detail],
        value: gapCounts[index].toLocaleString(),
        tone: gapCounts[index] ? ("alert" as const) : undefined,
      })),
    ],
    charts: [
      {
        title: "What is missing",
        kind: "bars",
        unit: "records",
        note: "Records in use that are missing each detail. One record can miss several.",
        data: missingDetails.map((detail, index) => ({
          label: missingDetailLabels[detail],
          value: gapCounts[index],
        })),
      },
    ],
    tables: [
      {
        heading: filters.missing ? missingDetailLabels[filters.missing] : "Records to complete",
        columns: [
          { label: "Item", width: 2, primary: true },
          { label: "Missing", width: 2.4 },
          { label: "Last checked", width: 1.1 },
        ],
        rows: items.map((item) => [
          [item.name, item.assetTag, `${item.category.name} · ${item.location.name}`]
            .filter(Boolean)
            .join("\n"),
          recordGaps(item, now)
            .map((detail) => missingDetailLabels[detail])
            .join("\n"),
          formatReportDateTime(item.lastCheckedAt),
        ]),
        total,
        emptyText: "Every record in use has these details. Nothing to complete.",
      },
    ],
    csv: [
      [
        "Asset tag",
        "Item",
        "Category",
        "Room",
        ...missingDetails.map((d) => missingDetailLabels[d]),
      ],
      ...items.map((item) => {
        const gaps = new Set(recordGaps(item, now));
        return [
          item.assetTag,
          item.name,
          item.category.name,
          item.location.name,
          ...missingDetails.map((detail) => (gaps.has(detail) ? "Missing" : "")),
        ];
      }),
    ],
  };
}
