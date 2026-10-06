import { ItemStatus, ItemType, type Prisma } from "@prisma/client";

import { inventoryStatusLabel } from "@/lib/inventory-status";
import { manilaDateText } from "@/lib/manila-date";
import { inventoryWhere } from "@/lib/record-search";
import { lowStockLevelFor, stockLevel, stockLevelLabel } from "@/lib/stock-level";
import { lowStockWhere, outOfStockWhere } from "@/lib/stock-queries";
import { prisma } from "@/prisma";

import { chips } from "../format";
import type { ReportModel } from "../model";
import { filterNames, loadCapped, type BuilderContext } from "./shared";

// Stock records, how many are left, and which are running low or out.
export async function buildStockReport(context: BuilderContext): Promise<ReportModel> {
  const { filters } = context;
  const where: Prisma.InventoryItemWhereInput = {
    AND: [
      inventoryWhere({
        category: filters.categoryId,
        location: filters.locationId,
        q: filters.query,
        stock: filters.stock,
      }),
      { itemType: ItemType.SUPPLY, status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } },
    ],
  };

  const [{ rows: items, total }, summary, low, out, names] = await Promise.all([
    loadCapped(
      context,
      {
        find: (take) =>
          prisma.inventoryItem.findMany({
            where,
            include: { category: true, location: true },
            orderBy: [{ quantity: "asc" }, { name: "asc" }],
            take,
          }),
        count: () => prisma.inventoryItem.count({ where }),
      },
      "stock records",
    ),
    prisma.inventoryItem.aggregate({ where, _sum: { quantity: true } }),
    prisma.inventoryItem.count({ where: { AND: [where, lowStockWhere()] } }),
    prisma.inventoryItem.count({ where: { AND: [where, outOfStockWhere()] } }),
    filterNames(filters),
  ]);

  const levelText = (item: (typeof items)[number]) => {
    const level = stockLevel(item);
    return level ? stockLevelLabel(level) : "";
  };

  return {
    kind: "stock",
    title: "Stock",
    description: "How many of each stock item are left, and what needs restocking.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      filters.stock === "low" && "Running low or out",
      filters.stock === "out" && "Out of stock",
      names.category && `Category: ${names.category}`,
      names.location && `Room: ${names.location}`,
    ),
    generatedAt: context.now,
    metrics: [
      { label: "Stock records", value: total.toLocaleString() },
      { label: "Units in stock", value: (summary._sum.quantity ?? 0).toLocaleString() },
      {
        label: "Running low",
        value: low.toLocaleString(),
        note: "includes out of stock",
        tone: low ? "alert" : undefined,
      },
      {
        label: "Out of stock",
        value: out.toLocaleString(),
        tone: out ? "alert" : undefined,
      },
    ],
    tables: [
      {
        heading: "Stock",
        columns: [
          { label: "Item", width: 2.2, primary: true },
          { label: "Left", width: 0.6, align: "right" },
          { label: "Alert at", width: 0.7, align: "right" },
          { label: "Level", width: 1.1 },
        ],
        rows: items.map((item) => [
          [item.name, `${item.category.name} · ${item.location.name}`, item.assetTag]
            .filter(Boolean)
            .join("\n"),
          item.quantity.toLocaleString(),
          lowStockLevelFor(item).toLocaleString(),
          [levelText(item), inventoryStatusLabel(item.status)].filter(Boolean).join("\n"),
        ]),
        total,
        emptyText: "No stock records match these filters.",
      },
    ],
    csv: [
      [
        "Item",
        "Asset tag",
        "QR code",
        "Category",
        "Location",
        "Quantity",
        "Alert at",
        "Level",
        "Status",
        "Last checked",
      ],
      ...items.map((item) => [
        item.name,
        item.assetTag,
        item.qrCode,
        item.category.name,
        item.location.name,
        item.quantity,
        lowStockLevelFor(item),
        levelText(item),
        inventoryStatusLabel(item.status),
        item.lastCheckedAt ? manilaDateText(item.lastCheckedAt) : "",
      ]),
    ],
  };
}
