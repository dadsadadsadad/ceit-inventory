import { ItemType, type Prisma } from "@prisma/client";

import { inventoryStatusLabel } from "@/lib/inventory-status";
import { manilaDateText } from "@/lib/manila-date";
import { inventoryWhere } from "@/lib/record-search";
import {
  warrantyDaysLeft,
  warrantyEndingWithinWhere,
  warrantyState,
  warrantyStateLabel,
  warrantyWarningDays,
  warrantyWhere,
} from "@/lib/warranty";
import { prisma } from "@/prisma";

import { monthChart, monthSpan, upcomingMonths } from "../charts";
import { chips, formatPeso, formatPesoShort, formatReportDay, plural } from "../format";
import type { ReportModel } from "../model";
import { itemDetailChips, itemDetailWhere } from "./item-filters";
import { filterNames, loadCapped, type BuilderContext } from "./shared";

const filterLabels = {
  expired: "Warranty ended",
  ending: `Ending within ${warrantyWarningDays} days`,
  active: "Under warranty",
  none: "No warranty recorded",
} as const;

export async function buildWarrantyReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const base: Prisma.InventoryItemWhereInput = {
    AND: [
      inventoryWhere({
        category: filters.categoryId,
        itemType: filters.itemType,
        location: filters.locationId,
        q: filters.query,
      }),
      ...itemDetailWhere(filters, now),
    ],
  };
  // a chosen window replaces the default 60 days
  const window = filters.within ?? warrantyWarningDays;
  const months = upcomingMonths(now, 12);
  const endingSoon = warrantyEndingWithinWhere(window, now);
  const where: Prisma.InventoryItemWhereInput = {
    AND: [
      base,
      filters.within
        ? endingSoon
        : filters.warranty
          ? warrantyWhere(filters.warranty, now)
          : { warrantyEndsAt: { not: null } },
    ],
  };
  const value = (extra: Prisma.InventoryItemWhereInput) =>
    prisma.inventoryItem
      .aggregate({ where: { AND: [base, extra] }, _sum: { purchasePrice: true } })
      .then((result) => Number(result._sum.purchasePrice?.toString() ?? 0));

  const [
    { rows: items, total },
    expired,
    ending,
    active,
    none,
    coveredValue,
    endingValue,
    endedValue,
    upcoming,
    names,
  ] = await Promise.all([
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
    prisma.inventoryItem.count({ where: { AND: [base, endingSoon] } }),
    prisma.inventoryItem.count({
      where: {
        AND: [
          base,
          { warrantyEndsAt: { not: null } },
          { NOT: endingSoon },
          { NOT: warrantyWhere("expired", now) },
        ],
      },
    }),
    prisma.inventoryItem.count({
      where: { AND: [base, { itemType: ItemType.ASSET }, warrantyWhere("none", now)] },
    }),
    value({ OR: [warrantyWhere("active", now), warrantyWhere("ending", now)] }),
    value(endingSoon),
    value(warrantyWhere("expired", now)),
    Promise.all(
      months.map((month) =>
        prisma.inventoryItem
          .count({
            where: { AND: [base, { warrantyEndsAt: { gte: month.start, lt: month.end } }] },
          })
          .then((count): [string, number] => [month.label, count]),
      ),
    ),
    filterNames(filters),
  ]);

  const stateText = (item: (typeof items)[number]) =>
    warrantyStateLabel(warrantyState(item.warrantyEndsAt, now));
  const daysText = (endsAt: Date) => {
    const days = warrantyDaysLeft(endsAt, now);
    if (days < 0) {
      return `Ended ${plural(-days, "day")} ago`;
    }
    return days === 0 ? "Ends today" : `${plural(days, "day")} left`;
  };

  return {
    kind: "warranty",
    title: "Warranty",
    description: "Warranties that ended or are ending soon.",
    filters: chips(
      filters.query && `Search: "${filters.query}"`,
      filters.within
        ? `Ending within ${filters.within} days`
        : filters.warranty && filterLabels[filters.warranty],
      names.category && `Category: ${names.category}`,
      names.location && `Room: ${names.location}`,
      filters.itemType && `Type: ${filters.itemType === "ASSET" ? "Equipment" : "Stock"}`,
      ...itemDetailChips(filters),
    ),
    generatedAt: now,
    metrics: [
      { label: "With a warranty", value: (expired + ending + active).toLocaleString() },
      {
        label: `Ending within ${window} days`,
        value: ending.toLocaleString(),
        note: endingValue ? `${formatPesoShort(endingValue)} of equipment` : undefined,
        tone: ending ? "alert" : undefined,
      },
      {
        label: "Warranty ended",
        value: expired.toLocaleString(),
        note: endedValue ? `${formatPesoShort(endedValue)} of equipment` : undefined,
      },
      { label: "Value still covered", value: formatPesoShort(coveredValue) },
      {
        label: "Equipment with no warranty",
        value: none.toLocaleString(),
        tone: none ? "alert" : undefined,
      },
    ],
    charts: [
      {
        title: "Warranty status",
        kind: "bars",
        unit: "records",
        data: [
          { label: "Under warranty", value: active, tone: "ok" },
          { label: `Ending within ${window} days`, value: ending, tone: "not_tested" },
          { label: "Ended", value: expired, tone: "defective" },
          { label: "No warranty recorded", value: none, tone: "retired" },
        ],
      },
      monthChart(
        "Warranties ending, next 12 months",
        upcoming,
        "warranties",
        `Warranties ending per month, ${monthSpan(months)}.`,
      ),
    ],
    tables: [
      {
        heading: filters.within ? `Ending within ${filters.within} days` : "Warranties",
        columns: [
          { label: "Item", width: 2.1, primary: true },
          { label: "Warranty ends", width: 1.3 },
          { label: "Price", width: 1, align: "right" },
          { label: "Purchased", width: 1 },
          { label: "Status", width: 0.9 },
        ],
        rows: items.map((item) => [
          [item.name, `${item.category.name} · ${item.location.name}`, item.assetTag]
            .filter(Boolean)
            .join("\n"),
          item.warrantyEndsAt
            ? `${formatReportDay(item.warrantyEndsAt)}\n${daysText(item.warrantyEndsAt)}`
            : "Not recorded",
          item.purchasePrice === null ? "No price" : formatPeso(item.purchasePrice),
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
        "Room",
        "Warranty ends",
        "Warranty status",
        "Days left",
        "Purchase date",
        "Purchase price (PHP)",
        "Status",
      ],
      ...items.map((item) => [
        item.name,
        item.assetTag,
        item.category.name,
        item.location.name,
        item.warrantyEndsAt ? manilaDateText(item.warrantyEndsAt) : "",
        stateText(item),
        item.warrantyEndsAt ? warrantyDaysLeft(item.warrantyEndsAt, now) : "",
        item.purchaseDate ? manilaDateText(item.purchaseDate) : "",
        item.purchasePrice === null ? "" : Number(item.purchasePrice.toString()),
        inventoryStatusLabel(item.status),
      ]),
    ],
  };
}
