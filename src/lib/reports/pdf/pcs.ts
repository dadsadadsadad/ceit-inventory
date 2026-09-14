import { prisma } from "@/prisma";
import {
  reportDateFilter as dateWhere,
  type ReportExportFilters,
} from "@/lib/report-export-filters";
import { documentResponse, reportDocument, mutedColor } from "../pdf-writer";
import { ItemStatus, type Prisma } from "@prisma/client";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { formatReportDateTime, humanize, filterLabel, hasFilters } from "../format";
import { pcProfileLimit } from "../limits";

type ComputerRecord = Prisma.InventoryItemGetPayload<{
  include: { category: true; location: true; computer: { include: { software: true } } };
}>;

// Combine the recorded hardware specifications.
function hardwareSummary(item: ComputerRecord) {
  const computer = item.computer;
  return (
    [
      computer?.processor,
      computer?.graphics,
      computer?.memoryGb === null || computer?.memoryGb === undefined
        ? null
        : `${computer.memoryGb} GB RAM`,
      computer?.storageGb === null || computer?.storageGb === undefined
        ? null
        : `${computer.storageGb} GB ${computer.storageType ?? "storage"}`,
    ]
      .filter(Boolean)
      .join(" | ") || "Not recorded"
  );
}

// Combine the operating system and version.
function softwareSummary(item: ComputerRecord) {
  const computer = item.computer;
  return (
    [computer?.operatingSystem, computer?.osVersion].filter(Boolean).join(" ") || "Not recorded"
  );
}

// List application names and versions.
function installedSoftware(item: ComputerRecord) {
  const entries = item.computer?.software ?? [];
  return entries.length
    ? entries.map((entry) => [entry.name, entry.version].filter(Boolean).join(" ")).join("; ")
    : "None recorded";
}

function lastChecked(item: ComputerRecord) {
  return item.lastCheckedAt ?? item.computer?.lastCheckedAt ?? null;
}

// One hardware and software profile per computer.
export async function createPcRegisterPdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const where: Prisma.InventoryItemWhereInput = {
    isComputer: true,
    ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
    ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
  };
  const pcs = await prisma.inventoryItem.findMany({
    where,
    include: {
      category: true,
      location: true,
      computer: { include: { software: { orderBy: { name: "asc" } } } },
    },
    orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
    take: pcProfileLimit + 1,
  });
  if (pcs.length > pcProfileLimit) {
    return new Response(
      `This PDF exceeds ${pcProfileLimit.toLocaleString()} PC or Mac records. Choose fewer records or download CSV.`,
      { status: 413 },
    );
  }

  const { document, writer } = await reportDocument(
    "PC / Mac register",
    "Hardware and software records",
  );
  writer.addBody("Hardware and software records.", 10, mutedColor);
  writer.addBody(filterLabel(filters, { inventoryStatus: true }), 8.5, mutedColor);
  writer.addHeading("Summary");
  writer.addMetricRow([
    { label: "PC / Mac records", value: pcs.length.toLocaleString() },
    {
      label: "Checked",
      value: pcs.filter((item) => lastChecked(item)).length.toLocaleString(),
    },
    {
      label: "Needs attention",
      value: pcs
        .filter(
          (item) => item.status === ItemStatus.DEFECTIVE || item.status === ItemStatus.NOT_TESTED,
        )
        .length.toLocaleString(),
    },
  ]);
  writer.addHeading("PC / Mac records");

  if (!pcs.length) {
    writer.addBody("No PC or Mac records match the selected filters.", 10, mutedColor);
  }
  pcs.forEach((item, index) => {
    const computer = item.computer;
    writer.addSubheading(`${index + 1}. ${item.name}`);
    writer.addDetailGrid([
      { label: "Asset tag", value: item.assetTag ?? "Not assigned" },
      { label: "Location", value: item.location.name },
      {
        label: "Status / condition",
        value: `${inventoryStatusLabel(item.status)} | ${humanize(item.condition)}`,
      },
      { label: "Last checked", value: formatReportDateTime(lastChecked(item)) },
      { label: "QR code", value: item.qrCode, wide: true },
      {
        label: "Manufacturer / model",
        value: [item.manufacturer, item.model].filter(Boolean).join(" | ") || "Not recorded",
      },
      { label: "Serial number", value: item.serialNumber ?? "Not recorded" },
      { label: "Hardware", value: hardwareSummary(item), wide: true },
      {
        label: "Hardware description",
        value: computer?.hardwareDescription ?? "Not recorded",
        wide: true,
      },
      { label: "Operating system", value: softwareSummary(item) },
      {
        label: "Network",
        value:
          [
            computer?.macAddress && `MAC ${computer.macAddress}`,
            computer?.ipAddress && `IP ${computer.ipAddress}`,
          ]
            .filter(Boolean)
            .join(" | ") || "Not recorded",
      },
      {
        label: "Software description",
        value: computer?.softwareDescription ?? "Not recorded",
      },
      { label: "Installed software", value: installedSoftware(item) },
    ]);
  });
  writer.finish();
  return documentResponse(
    document,
    `ceit-pc-register${hasFilters(filters, { inventory: true }) ? "-filtered" : ""}-${calendarDate}.pdf`,
  );
}
