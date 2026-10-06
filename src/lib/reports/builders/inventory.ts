import { ItemStatus, type Prisma } from "@prisma/client";

import { inventoryAttentionWhere, needsInventoryAttention } from "@/lib/inventory-attention";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { manilaDateText } from "@/lib/manila-date";
import { inventoryWhere } from "@/lib/record-search";
import { lowStockLevelFor, needsRestock, stockLevel, stockLevelLabel } from "@/lib/stock-level";
import { reportDateFilter } from "@/lib/report-export-filters";
import { loadCustomFields } from "@/lib/custom-field-queries";
import { formatCustomValue, readCustomValues } from "@/lib/custom-fields";
import { prisma } from "@/prisma";

import { chips, dateRangeChip, formatReportDay, formatReportDateTime, humanize } from "../format";
import type { ReportModel } from "../model";
import { filterNames, loadCapped, type BuilderContext } from "./shared";

const warrantyChip = {
  expired: "ended",
  ending: "ending soon",
  active: "still covered",
  none: "none recorded",
} as const;

// Equipment and supplies, narrowed by the same filters the Inventory page offers.
export async function buildInventoryReport(context: BuilderContext): Promise<ReportModel> {
  const { filters } = context;
  const created = reportDateFilter(filters.dateRange);
  const where: Prisma.InventoryItemWhereInput = {
    ...inventoryWhere({
      attention: filters.attention ? "1" : undefined,
      category: filters.categoryId,
      condition: filters.condition,
      itemType: filters.itemType,
      location: filters.locationId,
      q: filters.query,
      status: filters.inventoryStatus,
      stock: filters.stock,
      warranty: filters.warranty,
    }),
    ...(created ? { createdAt: created } : {}),
    ...(filters.pcOnly ? { isComputer: true } : {}),
  };

  const [{ rows: items, total }, summary, statusCounts, attention, names, customFields] =
    await Promise.all([
      loadCapped(context, {
        find: (take) =>
          prisma.inventoryItem.findMany({
            where,
            include: { category: true, location: true, computer: true },
            orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
            take,
          }),
        count: () => prisma.inventoryItem.count({ where }),
      }),
      prisma.inventoryItem.aggregate({
        where,
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      prisma.inventoryItem.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.inventoryItem.count({ where: { AND: [where, inventoryAttentionWhere] } }),
      filterNames(filters),
      loadCustomFields(),
    ]);
  const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const pcs = items.filter((item) => item.isComputer).length;

  return {
    kind: "inventory",
    title: "Inventory",
    description: "Equipment and supplies, where they are kept, and what condition they are in.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      filters.inventoryStatus && `Status: ${inventoryStatusLabel(filters.inventoryStatus)}`,
      filters.condition && `Condition: ${humanize(filters.condition)}`,
      names.category && `Category: ${names.category}`,
      names.location && `Room: ${names.location}`,
      filters.itemType && `Type: ${filters.itemType === "ASSET" ? "Equipment" : "Supplies"}`,
      filters.stock === "low" && "Stock running low or out",
      filters.stock === "out" && "Out of stock",
      filters.warranty && `Warranty: ${warrantyChip[filters.warranty]}`,
      filters.pcOnly && "PC / Mac only",
      filters.attention && "Needs attention",
      dateRangeChip(filters.dateRange, "Added"),
    ),
    generatedAt: context.now,
    metrics: [
      { label: "Records", value: summary._count._all.toLocaleString() },
      { label: "Units in stock", value: (summary._sum.quantity ?? 0).toLocaleString() },
      {
        label: "Needs attention",
        value: attention.toLocaleString(),
        tone: attention ? "alert" : undefined,
      },
    ],
    tables: [
      {
        heading: "By status",
        columns: [
          { label: "Status", width: 3 },
          { label: "Records", width: 1, align: "right" },
        ],
        rows: Object.values(ItemStatus)
          .filter((status) => statusMap.get(status))
          .map((status) => [
            inventoryStatusLabel(status),
            (statusMap.get(status) ?? 0).toLocaleString(),
          ]),
        total: statusMap.size,
        emptyText: "No records match these filters.",
      },
      {
        heading: "Records",
        note: pcs ? `${pcs.toLocaleString()} of the listed records are PCs or Macs.` : undefined,
        columns: [
          { label: "Asset tag", width: 1.25, primary: true },
          { label: "Item", width: 1.9, primary: true },
          { label: "Type", width: 0.9 },
          { label: "Status", width: 1 },
          { label: "Last checked", width: 1.15 },
        ],
        rows: items.map((item) => [
          [item.assetTag ?? "No asset tag", item.serialNumber && `Serial ${item.serialNumber}`]
            .filter(Boolean)
            .join("\n"),
          [
            item.name,
            `${item.category.name} · ${item.location.name}`,
            [item.manufacturer, item.model].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join("\n"),
          `${humanize(item.itemType)}\n${item.quantity} unit${item.quantity === 1 ? "" : "s"}${item.isComputer ? "\nPC / Mac" : ""}`,
          `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}${needsInventoryAttention(item) ? "\nNeeds attention" : ""}${needsRestock(item) ? `\n${stockLevelLabel(stockLevel(item)!)}` : ""}`,
          `${formatReportDateTime(item.lastCheckedAt)}\nAdded ${formatReportDay(item.createdAt)}`,
        ]),
        total,
        emptyText: "No records match these filters.",
      },
    ],
    csv: [
      [
        "Asset tag",
        "QR code",
        "Item",
        "Category",
        "Location",
        "Type",
        "Quantity",
        "Status",
        "Condition",
        "Manufacturer",
        "Model",
        "Serial number",
        "Created",
        "Purchase date",
        "Last checked",
        "PC operating system",
        "PC last checked",
        "Low stock alert",
        "Warranty ends",
        ...customFields.map((field) => field.label),
      ],
      ...items.map((item) => [
        item.assetTag,
        item.qrCode,
        item.name,
        item.category.name,
        item.location.name,
        humanize(item.itemType),
        item.quantity,
        inventoryStatusLabel(item.status),
        humanize(item.condition),
        item.manufacturer,
        item.model,
        item.serialNumber,
        item.createdAt,
        item.purchaseDate ? manilaDateText(item.purchaseDate) : "",
        item.lastCheckedAt ? manilaDateText(item.lastCheckedAt) : "",
        item.computer?.operatingSystem,
        item.computer?.lastCheckedAt ? manilaDateText(item.computer.lastCheckedAt) : "",
        item.itemType === "SUPPLY" ? lowStockLevelFor(item) : "",
        item.warrantyEndsAt ? manilaDateText(item.warrantyEndsAt) : "",
        ...customFields.map((field) =>
          formatCustomValue(field, readCustomValues(item.customFields)[field.id]),
        ),
      ]),
    ],
  };
}
