import { ItemStatus, type Prisma } from "@prisma/client";

import { inventoryAttentionWhere } from "@/lib/inventory-attention";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { inventoryWhere } from "@/lib/record-search";
import { warrantyState, warrantyStateLabel, warrantyWhere } from "@/lib/warranty";
import { prisma } from "@/prisma";

import { countChart } from "../charts";
import {
  chips,
  formatAge,
  formatPeso,
  formatPesoShort,
  formatReportDay,
  humanize,
} from "../format";
import type { ReportChart, ReportModel } from "../model";
import { itemDetailChips, itemDetailWhere } from "./item-filters";
import { filterNames, loadCapped, type BuilderContext } from "./shared";

const yearMs = 365.25 * 24 * 60 * 60 * 1000;
const ageBands = [
  { label: "Under 1 year", below: 1 },
  { label: "1 to 3 years", below: 3 },
  { label: "3 to 5 years", below: 5 },
  { label: "5 years or more", below: Number.POSITIVE_INFINITY },
];

const money = (value: Prisma.Decimal | number | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value.toString());

// What the department's equipment is worth: where the value sits, how old it is, and what is at risk.
export async function buildValueReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const where: Prisma.InventoryItemWhereInput = {
    AND: [
      inventoryWhere({
        category: filters.categoryId,
        itemType: filters.itemType,
        location: filters.locationId,
        q: filters.query,
        status: filters.inventoryStatus,
      }),
      ...itemDetailWhere(filters, now),
    ],
  };
  const priced: Prisma.InventoryItemWhereInput = { AND: [where, { purchasePrice: { not: null } }] };
  const sum = (extra: Prisma.InventoryItemWhereInput) =>
    prisma.inventoryItem
      .aggregate({ where: { AND: [priced, extra] }, _sum: { purchasePrice: true } })
      .then((result) => money(result._sum.purchasePrice));

  const [
    { rows: items, total },
    totals,
    pricedCount,
    attentionValue,
    goneValue,
    coveredValue,
    endedValue,
    byCategory,
    byRoom,
    purchases,
    names,
  ] = await Promise.all([
    loadCapped(context, {
      find: (take) =>
        prisma.inventoryItem.findMany({
          where,
          include: { category: true, location: true },
          orderBy: [{ purchasePrice: { sort: "desc", nulls: "last" } }, { name: "asc" }],
          take,
        }),
      count: () => prisma.inventoryItem.count({ where }),
    }),
    prisma.inventoryItem.aggregate({
      where: priced,
      _sum: { purchasePrice: true },
      _avg: { purchasePrice: true },
      _max: { purchasePrice: true },
    }),
    prisma.inventoryItem.count({ where: priced }),
    sum(inventoryAttentionWhere),
    sum({ status: { in: [ItemStatus.LOST, ItemStatus.RETIRED] } }),
    sum({ OR: [warrantyWhere("active", now), warrantyWhere("ending", now)] }),
    sum(warrantyWhere("expired", now)),
    prisma.inventoryItem.groupBy({
      by: ["categoryId"],
      where,
      _sum: { purchasePrice: true },
      _count: { _all: true },
    }),
    prisma.inventoryItem.groupBy({
      by: ["locationId"],
      where: priced,
      _sum: { purchasePrice: true },
    }),
    prisma.inventoryItem.findMany({
      where: { AND: [priced, { purchaseDate: { not: null } }] },
      select: { purchaseDate: true, purchasePrice: true },
      take: 20_000,
    }),
    filterNames(filters),
  ]);

  const [categories, rooms] = await Promise.all([
    prisma.category.findMany({
      where: { id: { in: byCategory.map((group) => group.categoryId) } },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { id: { in: byRoom.map((group) => group.locationId) } },
      select: { id: true, name: true },
    }),
  ]);
  const categoryName = new Map(categories.map((entry) => [entry.id, entry.name]));
  const roomName = new Map(rooms.map((entry) => [entry.id, entry.name]));
  const totalValue = money(totals._sum.purchasePrice);

  // Purchases in each of the last six calendar years, by purchase date.
  const thisYear = Number(now.toISOString().slice(0, 4));
  const years = Array.from({ length: 6 }, (_, index) => thisYear - 5 + index);
  const yearValue = new Map(years.map((year) => [year, 0]));
  const ageCounts = ageBands.map(() => 0);
  for (const purchase of purchases) {
    const date = purchase.purchaseDate!;
    const year = Number(date.toISOString().slice(0, 4));
    if (yearValue.has(year)) {
      yearValue.set(year, (yearValue.get(year) ?? 0) + money(purchase.purchasePrice));
    }
    const age = (now.getTime() - date.getTime()) / yearMs;
    ageCounts[ageBands.findIndex((band) => age < band.below)] += 1;
  }

  const peso = (chart: ReportChart): ReportChart => ({ ...chart, format: "peso" });
  const categoryRows = byCategory
    .map((group) => ({
      name: categoryName.get(group.categoryId) ?? "Unknown category",
      records: group._count._all,
      value: money(group._sum.purchasePrice),
    }))
    .sort((first, second) => second.value - first.value || first.name.localeCompare(second.name));

  return {
    kind: "value",
    title: "Asset value",
    description:
      "What the equipment is worth, where that value sits, how old it is, and what is at risk.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      filters.inventoryStatus && `Status: ${inventoryStatusLabel(filters.inventoryStatus)}`,
      names.category && `Category: ${names.category}`,
      names.location && `Room: ${names.location}`,
      filters.itemType && `Type: ${filters.itemType === "ASSET" ? "Equipment" : "Stock"}`,
      ...itemDetailChips(filters),
    ),
    generatedAt: now,
    narrowed: Boolean(
      filters.query ||
      filters.inventoryStatus ||
      filters.categoryId ||
      filters.locationId ||
      filters.itemType ||
      itemDetailChips(filters).some(Boolean),
    ),
    metrics: [
      {
        label: "Total value",
        value: formatPesoShort(totalValue),
        note: "purchase prices on record",
      },
      {
        label: "Records with a price",
        value: `${pricedCount.toLocaleString()} of ${total.toLocaleString()}`,
        tone: pricedCount < total ? "alert" : undefined,
        note:
          pricedCount < total
            ? `${(total - pricedCount).toLocaleString()} have no price`
            : undefined,
      },
      { label: "Average price", value: formatPesoShort(money(totals._avg.purchasePrice)) },
      { label: "Most valuable", value: formatPesoShort(money(totals._max.purchasePrice)) },
      {
        label: "Value needing attention",
        value: formatPesoShort(attentionValue),
        note: "defective, untested, or poor",
        tone: attentionValue ? "alert" : undefined,
      },
      {
        label: "Value lost or retired",
        value: formatPesoShort(goneValue),
        tone: goneValue ? "alert" : undefined,
      },
      { label: "Value under warranty", value: formatPesoShort(coveredValue) },
      { label: "Value out of warranty", value: formatPesoShort(endedValue) },
    ],
    charts: [
      peso(
        countChart(
          "Value by category",
          categoryRows.map((row): [string, number] => [row.name, row.value]),
          "pesos",
        ),
      ),
      peso(
        countChart(
          "Value by room",
          byRoom.map((group): [string, number] => [
            roomName.get(group.locationId) ?? "Unknown room",
            money(group._sum.purchasePrice),
          ]),
          "pesos",
        ),
      ),
      {
        title: "Purchases by year",
        kind: "columns",
        format: "peso",
        unit: "pesos",
        note: "Value bought each year, by purchase date.",
        data: years.map((year) => ({ label: String(year), value: yearValue.get(year) ?? 0 })),
      },
      {
        title: "Equipment age",
        kind: "bars",
        unit: "records",
        note: "Records with a purchase date, by how long ago they were bought.",
        data: ageBands.map((band, index) => ({ label: band.label, value: ageCounts[index] })),
      },
    ],
    tables: [
      {
        heading: "Value by category",
        columns: [
          { label: "Category", width: 2, primary: true },
          { label: "Records", width: 0.8, align: "right" },
          { label: "Total value", width: 1.3, align: "right" },
          { label: "Share", width: 0.8, align: "right" },
        ],
        rows: categoryRows.map((row) => [
          row.name,
          row.records.toLocaleString(),
          formatPeso(row.value),
          totalValue ? `${((row.value / totalValue) * 100).toFixed(1)}%` : "0%",
        ]),
        total: categoryRows.length,
        emptyText: "No records match these filters.",
      },
      {
        heading: "Records by value",
        note: "Most valuable first. Records without a price come last.",
        columns: [
          { label: "Item", width: 2, primary: true },
          { label: "Status", width: 1 },
          { label: "Price", width: 1.1, align: "right" },
          { label: "Purchased", width: 1.1 },
          { label: "Warranty", width: 1.3 },
        ],
        rows: items.map((item) => [
          [item.name, item.assetTag, `${item.category.name} · ${item.location.name}`]
            .filter(Boolean)
            .join("\n"),
          `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}`,
          item.purchasePrice === null ? "No price" : formatPeso(item.purchasePrice),
          item.purchaseDate
            ? `${formatReportDay(item.purchaseDate)}\n${formatAge(item.purchaseDate, now)} old`
            : "No date",
          item.warrantyEndsAt
            ? `${formatReportDay(item.warrantyEndsAt)}\n${warrantyStateLabel(warrantyState(item.warrantyEndsAt, now))}`
            : "None recorded",
        ]),
        total,
        emptyText: "No records match these filters.",
      },
    ],
    csv: [
      [
        "Asset tag",
        "Item",
        "Category",
        "Room",
        "Status",
        "Condition",
        "Purchase price (PHP)",
        "Purchase date",
        "Age (years)",
        "Warranty ends",
        "Warranty status",
      ],
      ...items.map((item) => [
        item.assetTag,
        item.name,
        item.category.name,
        item.location.name,
        inventoryStatusLabel(item.status),
        humanize(item.condition),
        item.purchasePrice === null ? "" : money(item.purchasePrice),
        item.purchaseDate,
        item.purchaseDate
          ? Math.round(((now.getTime() - item.purchaseDate.getTime()) / yearMs) * 10) / 10
          : "",
        item.warrantyEndsAt,
        warrantyStateLabel(warrantyState(item.warrantyEndsAt, now)),
      ]),
    ],
  };
}
