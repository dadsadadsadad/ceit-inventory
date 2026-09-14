import { prisma } from "@/prisma";
import {
  reportDateFilter as dateWhere,
  type ReportExportFilters,
} from "@/lib/report-export-filters";
import { documentResponse, reportDocument, mutedColor } from "../pdf-writer";
import { ItemCondition, ItemStatus, type Prisma } from "@prisma/client";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import {
  formatReportDate,
  formatReportDateTime,
  humanize,
  filterLabel,
  hasFilters,
} from "../format";
import { pdfRowLimit } from "../limits";

// Inventory rows and totals.
export async function createInventoryPdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const where: Prisma.InventoryItemWhereInput = {
    ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
    ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
    ...(filters.pcOnly ? { isComputer: true } : {}),
  };
  const items = await prisma.inventoryItem.findMany({
    where,
    include: { category: true, location: true, computer: true },
    orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
    take: pdfRowLimit + 1,
  });
  if (items.length > pdfRowLimit) {
    return new Response(
      `This export exceeds ${pdfRowLimit.toLocaleString()} records. Narrow the data before exporting.`,
      { status: 413 },
    );
  }

  const { document, writer } = await reportDocument("Inventory", "Equipment and supplies");
  writer.addBody("Equipment and supplies.", 10, mutedColor);
  writer.addBody(filterLabel(filters, { inventoryStatus: true, pcOnly: true }), 8.5, mutedColor);
  writer.addHeading("Summary");
  writer.addMetricRow([
    { label: "Records", value: items.length.toLocaleString() },
    {
      label: "Quantity",
      value: items.reduce((total, item) => total + item.quantity, 0).toLocaleString(),
    },
    {
      label: "Equipment",
      value: items.filter((item) => item.itemType === "ASSET").length.toLocaleString(),
    },
  ]);
  writer.addMetricRow([
    {
      label: "PC / Mac records",
      value: items.filter((item) => item.isComputer).length.toLocaleString(),
    },
    {
      label: "Needs attention",
      value: items
        .filter(
          (item) =>
            item.status === ItemStatus.DEFECTIVE ||
            item.status === ItemStatus.NOT_TESTED ||
            item.condition === ItemCondition.FOR_REPAIR,
        )
        .length.toLocaleString(),
    },
  ]);
  writer.addHeading("Inventory records");
  writer.addTable(
    ["Asset tag / QR", "Item", "Type / quantity", "Status / condition", "Last checked"],
    items.map((item) => [
      [
        item.assetTag ?? "No asset tag",
        `QR: ${item.qrCode}`,
        item.serialNumber && `Serial: ${item.serialNumber}`,
      ]
        .filter(Boolean)
        .join("\n"),
      [
        item.name,
        `${item.category.name} | ${item.location.name}`,
        [item.manufacturer, item.model].filter(Boolean).join(" "),
        item.description,
      ]
        .filter(Boolean)
        .join("\n"),
      `${humanize(item.itemType)} | ${item.quantity} unit${item.quantity === 1 ? "" : "s"}${item.isComputer ? "\nPC / Mac" : ""}`,
      `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}`,
      `Last checked: ${formatReportDateTime(item.lastCheckedAt)}\nCreated: ${formatReportDate(item.createdAt)}`,
    ]),
    { fontSize: 8.1, maxCellCharacters: 135, widths: [1.18, 1.55, 0.9, 1, 1.27] },
  );
  writer.finish();
  return documentResponse(
    document,
    `ceit-inventory${hasFilters(filters, { inventory: true, pcOnly: true }) ? "-filtered" : ""}-${calendarDate}.pdf`,
  );
}
