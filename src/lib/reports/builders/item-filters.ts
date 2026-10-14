import { ItemType, type Prisma } from "@prisma/client";

import { inspectionIntervalDays } from "@/lib/inventory-attention";
import type { MissingDetail, ReportExportFilters } from "@/lib/report-export-filters";
import { reportDateFilter } from "@/lib/report-export-filters";

import { dateRangeChip, formatPesoShort } from "../format";
import { incompletePcWhere } from "./pcs";

const dayMs = 24 * 60 * 60 * 1000;

export const missingDetailLabels: Record<MissingDetail, string> = {
  price: "No purchase price",
  purchaseDate: "No purchase date",
  serial: "No serial number",
  warranty: "No warranty date",
  photo: "No photo",
  inspection: `Not checked in ${inspectionIntervalDays}+ days`,
  pcDetails: "PC missing hardware details",
};

// serial and warranty only apply to assets
export function missingWhere(detail: MissingDetail, now: Date): Prisma.InventoryItemWhereInput {
  switch (detail) {
    case "price":
      return { purchasePrice: null };
    case "purchaseDate":
      return { purchaseDate: null };
    case "serial":
      return { itemType: ItemType.ASSET, serialNumber: null };
    case "warranty":
      return { itemType: ItemType.ASSET, warrantyEndsAt: null };
    case "photo":
      return { photos: { none: {} } };
    case "inspection":
      return {
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lt: new Date(now.getTime() - inspectionIntervalDays * dayMs) } },
        ],
      };
    case "pcDetails":
      return { AND: [{ isComputer: true }, incompletePcWhere] };
  }
}

export function itemDetailWhere(
  filters: Pick<ReportExportFilters, "missing" | "priceMax" | "priceMin" | "purchased">,
  now: Date,
): Prisma.InventoryItemWhereInput[] {
  const purchased = reportDateFilter(filters.purchased);
  return [
    ...(filters.priceMin !== undefined || filters.priceMax !== undefined
      ? [
          {
            purchasePrice: {
              ...(filters.priceMin !== undefined ? { gte: filters.priceMin } : {}),
              ...(filters.priceMax !== undefined ? { lte: filters.priceMax } : {}),
            },
          },
        ]
      : []),
    ...(purchased ? [{ purchaseDate: purchased }] : []),
    ...(filters.missing ? [missingWhere(filters.missing, now)] : []),
  ];
}

export function itemDetailChips(
  filters: Pick<ReportExportFilters, "missing" | "priceMax" | "priceMin" | "purchased">,
) {
  const { priceMin, priceMax } = filters;
  return [
    priceMin !== undefined && priceMax !== undefined
      ? `Price: ${formatPesoShort(priceMin)} to ${formatPesoShort(priceMax)}`
      : priceMin !== undefined
        ? `Price: ${formatPesoShort(priceMin)} or more`
        : priceMax !== undefined
          ? `Price: up to ${formatPesoShort(priceMax)}`
          : null,
    dateRangeChip(filters.purchased, "Purchased"),
    filters.missing ? missingDetailLabels[filters.missing] : null,
  ];
}
