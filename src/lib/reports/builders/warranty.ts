import type { Prisma } from "@prisma/client";

import { inventoryStatusLabel } from "@/lib/inventory-status";
import { manilaDateText } from "@/lib/manila-date";
import { inventoryWhere } from "@/lib/record-search";
import {
  warrantyState,
  warrantyStateLabel,
  warrantyWarningDays,
  warrantyWhere,
} from "@/lib/warranty";
import { prisma } from "@/prisma";

import { chips, formatReportDay } from "../format";
import type { ReportModel } from "../model";
import { filterNames, loadCapped, type BuilderContext } from "./shared";

const filterLabels = {
  expired: "Warranty ended",
  ending: `Ending within ${warrantyWarningDays} days`,
  active: "Under warranty",
  none: "No warranty recorded",
} as const;

// Equipment warranties: what has ended, what is ending, and what has no warranty on record.
export async function buildWarrantyReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const base: Prisma.InventoryItemWhereInput = inventoryWhere({
    category: filters.categoryId,
    itemType: filters.itemType,
    location: filters.locationId,
    q: filters.query,
  });
  const where: Prisma.InventoryItemWhereInput = {
    AND: [
      base,
      filters.warranty ? warrantyWhere(filters.warranty, now) : { warrantyEndsAt: { not: null } },
    ],
  };

  const [{ rows: items, total }, expired, ending, active, names] = await Promise.all([
    loadCapped(context, {
      find: (take) =>
        prisma.inventoryItem.findMany({
          where,
          include: { category: true, location: true },
          orderBy: [{ warrantyEndsAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
          take,
        }),
      count: () => prisma.inventoryItem.count({ where }),
    }),
    prisma.inventoryItem.count({ where: { AND: [base, warrantyWhere("expired", now)] } }),
    prisma.inventoryItem.count({ where: { AND: [base, warrantyWhere("ending", now)] } }),
    prisma.inventoryItem.count({ where: { AND: [base, warrantyWhere("active", now)] } }),
    filterNames(filters),
  ]);

  const stateText = (item: (typeof items)[number]) =>
    warrantyStateLabel(warrantyState(item.warrantyEndsAt, now));

  return {
    kind: "warranty",
    title: "Warranty",
    description: "Which warranties have ended, which are ending soon, and which are still running.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      filters.warranty && filterLabels[filters.warranty],
      names.category && `Category: ${names.category}`,
      names.location && `Room: ${names.location}`,
      filters.itemType && `Type: ${filters.itemType === "ASSET" ? "Equipment" : "Stock"}`,
    ),
    generatedAt: now,
    metrics: [
      { label: "With a warranty", value: (expired + ending + active).toLocaleString() },
      {
        label: "Ending soon",
        value: ending.toLocaleString(),
        note: `within ${warrantyWarningDays} days`,
        tone: ending ? "alert" : undefined,
      },
      { label: "Warranty ended", value: expired.toLocaleString() },
      { label: "Still covered", value: active.toLocaleString() },
    ],
    tables: [
      {
        heading: "Warranties",
        columns: [
          { label: "Item", width: 2.2, primary: true },
          { label: "Warranty ends", width: 1.2 },
          { label: "Purchased", width: 1 },
          { label: "Status", width: 1 },
        ],
        rows: items.map((item) => [
          [item.name, `${item.category.name} · ${item.location.name}`, item.assetTag]
            .filter(Boolean)
            .join("\n"),
          item.warrantyEndsAt
            ? `${formatReportDay(item.warrantyEndsAt)}\n${stateText(item)}`
            : "Not recorded",
          formatReportDay(item.purchaseDate),
          inventoryStatusLabel(item.status),
        ]),
        total,
        emptyText: "No equipment matches these filters.",
      },
    ],
    csv: [
      [
        "Item",
        "Asset tag",
        "Category",
        "Location",
        "Warranty ends",
        "Warranty status",
        "Purchase date",
        "Status",
      ],
      ...items.map((item) => [
        item.name,
        item.assetTag,
        item.category.name,
        item.location.name,
        item.warrantyEndsAt ? manilaDateText(item.warrantyEndsAt) : "",
        stateText(item),
        item.purchaseDate ? manilaDateText(item.purchaseDate) : "",
        inventoryStatusLabel(item.status),
      ]),
    ],
  };
}
