import {
  componentValue,
  groupHardware,
  hardwareComponents,
  isIncompleteProfile,
  type DirectoryPc,
} from "@/lib/computer-directory";
import { loadComputers } from "@/lib/computer-queries";
import { manilaDateText } from "@/lib/manila-date";

import { chips } from "../format";
import { capRows, type ReportModel, type ReportTable } from "../model";
import { filterNames, type BuilderContext } from "./shared";

const listedPcs = 40;

/** PC names with their rooms, cut short for a table cell. */
export function pcNames(pcs: DirectoryPc[], maximum = listedPcs) {
  const shown = pcs.slice(0, maximum).map((pc) => `${pc.name} (${pc.room})`);
  return pcs.length > maximum
    ? `${shown.join(", ")} and ${(pcs.length - maximum).toLocaleString()} more`
    : shown.join(", ");
}

// What hardware the PCs have, grouped by part, and which PCs share each one.
export async function buildHardwareReport(context: BuilderContext): Promise<ReportModel> {
  const { filters } = context;
  const [loaded, names] = await Promise.all([
    loadComputers({
      includeRetired: filters.includeRetired,
      location: filters.locationId,
      q: filters.query,
    }),
    filterNames(filters),
  ]);
  const everyPc = loaded.computers;
  const incompleteCount = everyPc.filter(isIncompleteProfile).length;
  const computers = filters.incomplete ? everyPc.filter(isIncompleteProfile) : everyPc;
  const rooms = new Set(computers.map((entry) => entry.pc.room)).size;
  const memory = computers.reduce((total, entry) => total + (entry.memoryGb ?? 0), 0);
  const parts = filters.component
    ? hardwareComponents.filter((component) => component.value === filters.component)
    : hardwareComponents;

  const tables: ReportTable[] = parts.map((component) => {
    const groups = groupHardware(computers, component.value);
    return {
      heading: `By ${component.label.toLowerCase()}`,
      columns: [
        { label: component.label, width: 1.5, primary: true },
        { label: "PCs", width: 0.5, align: "right" },
        { label: "Which PCs", width: 3 },
      ],
      rows: capRows(groups, context.purpose, "groups").rows.map((group) => [
        group.value,
        group.count.toLocaleString(),
        pcNames(group.pcs),
      ]),
      total: groups.length,
      emptyText: "No PCs match these filters.",
    };
  });

  const listed = capRows(computers, context.purpose, "PCs");
  if (!filters.component) {
    tables.push({
      heading: "Every PC",
      columns: [
        { label: "PC", width: 1.4, primary: true },
        { label: "Processor", width: 1.5 },
        { label: "Memory", width: 0.7 },
        { label: "Storage", width: 1 },
        { label: "Graphics", width: 1.2 },
        { label: "System", width: 1.2 },
      ],
      rows: listed.rows.map((entry) => [
        `${entry.pc.name}\n${entry.pc.assetTag ?? "No asset tag"}\n${entry.pc.room}`,
        componentValue(entry, "processor") ?? "Not recorded",
        componentValue(entry, "memory") ?? "Not recorded",
        componentValue(entry, "storage") ?? "Not recorded",
        componentValue(entry, "graphics") ?? "Not recorded",
        componentValue(entry, "os") ?? "Not recorded",
      ]),
      total: listed.total,
      emptyText: "No PCs match these filters.",
    });
  }

  return {
    kind: "hardware",
    title: filters.component
      ? `Hardware: ${hardwareComponents.find((part) => part.value === filters.component)?.label}`
      : "Hardware",
    description: "What your PCs are made of, and which machines share the same parts.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      names.location && `Room: ${names.location}`,
      filters.component &&
        `Part: ${hardwareComponents.find((part) => part.value === filters.component)?.label}`,
      filters.incomplete && "Missing hardware details",
      filters.includeRetired && "Includes retired and lost PCs",
    ),
    generatedAt: context.now,
    metrics: [
      { label: "PCs", value: computers.length.toLocaleString() },
      { label: "Rooms", value: rooms.toLocaleString() },
      { label: "Total memory", value: `${memory.toLocaleString()} GB` },
      {
        label: "Missing details",
        value: incompleteCount.toLocaleString(),
        note: "across all matching PCs",
        tone: incompleteCount ? "alert" : undefined,
      },
    ],
    tables,
    csv:
      context.purpose === "csv"
        ? [
            [
              "PC",
              "Asset tag",
              "Room",
              "Processor",
              "Graphics",
              "Memory (GB)",
              "Storage (GB)",
              "Storage type",
              "Operating system",
              "OS version",
              "MAC address",
              "IP address",
              "Last checked",
            ],
            ...capRows(computers, "csv", "PCs").rows.map((entry) => [
              entry.pc.name,
              entry.pc.assetTag,
              entry.pc.room,
              entry.processor,
              entry.graphics,
              entry.memoryGb,
              entry.storageGb,
              entry.storageType,
              entry.operatingSystem,
              entry.osVersion,
              entry.macAddress,
              entry.ipAddress,
              entry.lastCheckedAt ? manilaDateText(entry.lastCheckedAt) : "",
            ]),
          ]
        : undefined,
  };
}
