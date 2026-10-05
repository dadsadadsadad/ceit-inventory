import type { Prisma } from "@prisma/client";

import { inventoryAttentionWhere } from "@/lib/inventory-attention";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { manilaDateText } from "@/lib/manila-date";
import { inventoryWhere } from "@/lib/record-search";
import { reportDateFilter } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

import { chips, dateRangeChip, formatReportDateTime, humanize } from "../format";
import type { ReportModel } from "../model";
import { filterNames, loadCapped, type BuilderContext } from "./shared";

/** A PC with no processor, memory, or storage recorded, or no hardware profile at all. */
export const incompletePcWhere: Prisma.InventoryItemWhereInput = {
  OR: [
    { computer: { is: null } },
    { computer: { is: { OR: [{ processor: null }, { memoryGb: null }, { storageGb: null }] } } },
  ],
};

const listedSoftware = 10;

// One entry per PC: hardware, operating system, and what is installed.
export async function buildPcRegisterReport(context: BuilderContext): Promise<ReportModel> {
  const { filters } = context;
  const created = reportDateFilter(filters.dateRange);
  const where: Prisma.InventoryItemWhereInput = {
    AND: [
      inventoryWhere({
        category: filters.categoryId,
        location: filters.locationId,
        q: filters.query,
        status: filters.inventoryStatus,
      }),
      { isComputer: true },
      ...(created ? [{ createdAt: created }] : []),
      ...(filters.incomplete ? [incompletePcWhere] : []),
    ],
  };

  const [{ rows: pcs, total }, attention, incomplete, names] = await Promise.all([
    loadCapped(
      context,
      {
        find: (take) =>
          prisma.inventoryItem.findMany({
            where,
            include: {
              category: true,
              location: true,
              computer: { include: { software: { orderBy: { name: "asc" } } } },
            },
            orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
            take,
          }),
        count: () => prisma.inventoryItem.count({ where }),
      },
      "PCs",
    ),
    prisma.inventoryItem.count({ where: { AND: [where, inventoryAttentionWhere] } }),
    prisma.inventoryItem.count({ where: { AND: [where, incompletePcWhere] } }),
    filterNames(filters),
  ]);

  const hardware = (item: (typeof pcs)[number]) => {
    const computer = item.computer;
    return [
      computer?.processor,
      computer?.graphics,
      [
        computer?.memoryGb != null && `${computer.memoryGb} GB RAM`,
        computer?.storageGb != null &&
          `${computer.storageGb} GB ${computer.storageType ?? "storage"}`,
      ]
        .filter(Boolean)
        .join(" · "),
    ].filter(Boolean);
  };
  const software = (item: (typeof pcs)[number]) =>
    (item.computer?.software ?? []).map((entry) =>
      [entry.name, entry.version].filter(Boolean).join(" "),
    );

  return {
    kind: "pcs",
    title: "PC register",
    description: "Every PC with its hardware, operating system, and installed software.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      filters.inventoryStatus && `Status: ${inventoryStatusLabel(filters.inventoryStatus)}`,
      names.location && `Room: ${names.location}`,
      filters.incomplete && "Missing hardware details",
      dateRangeChip(filters.dateRange, "Added"),
    ),
    generatedAt: context.now,
    metrics: [
      { label: "PCs", value: total.toLocaleString() },
      {
        label: "Missing hardware details",
        value: incomplete.toLocaleString(),
        tone: incomplete ? "alert" : undefined,
      },
      {
        label: "Needs attention",
        value: attention.toLocaleString(),
        tone: attention ? "alert" : undefined,
      },
    ],
    tables: [
      {
        heading: "PCs",
        columns: [
          { label: "PC", width: 1.35, primary: true },
          { label: "Hardware", width: 1.7 },
          { label: "System and software", width: 1.9 },
          { label: "Status", width: 1 },
        ],
        rows: pcs.map((item) => {
          const programs = software(item);
          return [
            [item.name, item.assetTag ?? "No asset tag", item.location.name].join("\n"),
            hardware(item).join("\n") || "Not recorded",
            [
              [item.computer?.operatingSystem, item.computer?.osVersion]
                .filter(Boolean)
                .join(" ") || "System not recorded",
              programs.length
                ? `${programs.slice(0, listedSoftware).join(", ")}${programs.length > listedSoftware ? ` and ${programs.length - listedSoftware} more` : ""}`
                : "No software recorded",
            ].join("\n"),
            `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}\nChecked ${formatReportDateTime(item.lastCheckedAt ?? item.computer?.lastCheckedAt)}`,
          ];
        }),
        total,
        emptyText: "No PCs match these filters.",
      },
    ],
    csv: [
      [
        "Asset tag",
        "QR code",
        "PC / Mac name",
        "Category",
        "Location",
        "Status",
        "Condition",
        "Last checked",
        "Manufacturer",
        "Model",
        "Serial number",
        "Operating system",
        "OS version",
        "Processor",
        "Graphics",
        "Memory (GB)",
        "Storage (GB)",
        "Storage type",
        "MAC address",
        "IP address",
        "Hardware description",
        "Software description",
        "Installed software",
      ],
      ...pcs.map((item) => [
        item.assetTag,
        item.qrCode,
        item.name,
        item.category.name,
        item.location.name,
        inventoryStatusLabel(item.status),
        humanize(item.condition),
        item.lastCheckedAt ? manilaDateText(item.lastCheckedAt) : "",
        item.manufacturer,
        item.model,
        item.serialNumber,
        item.computer?.operatingSystem,
        item.computer?.osVersion,
        item.computer?.processor,
        item.computer?.graphics,
        item.computer?.memoryGb,
        item.computer?.storageGb,
        item.computer?.storageType,
        item.computer?.macAddress,
        item.computer?.ipAddress,
        item.computer?.hardwareDescription,
        item.computer?.softwareDescription,
        software(item).join("; "),
      ]),
    ],
  };
}
