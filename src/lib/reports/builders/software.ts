import {
  groupSoftware,
  licenseState,
  licenseStateLabel,
  sortSoftwareGroups,
  type SoftwareGroup,
} from "@/lib/computer-directory";
import { loadSoftware } from "@/lib/computer-queries";
import { manilaDateText } from "@/lib/manila-date";

import { chips, formatReportDay } from "../format";
import { capRows, type ReportModel } from "../model";
import { pcNames } from "./hardware";
import { filterNames, type BuilderContext } from "./shared";

const licenseChips = {
  expired: "License expired",
  expiring: "License ending within 30 days",
  dated: "Has a license date",
  none: "No license date",
} as const;

function licenseSummary(group: SoftwareGroup) {
  if (group.state === "none") {
    return "No license date";
  }
  return group.state === "valid"
    ? `Valid until ${formatReportDay(group.soonestExpiry)}`
    : `${group.state === "expired" ? "Expired" : "Ends"} ${formatReportDay(group.soonestExpiry)}`;
}

// Every installed program, where it runs, and when its licenses end.
export async function buildSoftwareReport(context: BuilderContext): Promise<ReportModel> {
  const { filters, now } = context;
  const [loaded, names] = await Promise.all([
    loadSoftware(
      {
        includeRetired: filters.includeRetired,
        license: filters.license,
        location: filters.locationId,
        q: filters.query,
      },
      now,
    ),
    filterNames(filters),
  ]);
  const groups = sortSoftwareGroups(
    groupSoftware(loaded.entries, now),
    filters.license ? "expiry" : "name",
  );
  const expiring = groups.filter((group) => group.state === "expiring").length;
  const expired = groups.filter((group) => group.state === "expired").length;
  const titles = capRows(groups, context.purpose, "titles");
  const installs = capRows(
    groups.flatMap((group) => group.installs.map((install) => ({ group, install }))),
    context.purpose,
    "installations",
  );

  return {
    kind: "software",
    title: "Software",
    description: "Every installed program, which PCs have it, and when licenses end.",
    filters: chips(
      filters.query && `Search: “${filters.query}”`,
      names.location && `Room: ${names.location}`,
      filters.license && licenseChips[filters.license],
      filters.includeRetired && "Includes retired and lost PCs",
    ),
    generatedAt: now,
    metrics: [
      { label: "Titles", value: groups.length.toLocaleString() },
      { label: "Installations", value: loaded.entries.length.toLocaleString() },
      {
        label: "Licenses ending soon",
        value: expiring.toLocaleString(),
        tone: expiring ? "alert" : undefined,
      },
      {
        label: "Licenses expired",
        value: expired.toLocaleString(),
        tone: expired ? "alert" : undefined,
      },
    ],
    tables: [
      {
        heading: "Software titles",
        columns: [
          { label: "Software", width: 1.3, primary: true },
          { label: "PCs", width: 0.45, align: "right" },
          { label: "Versions", width: 0.9 },
          { label: "License", width: 1.2 },
          { label: "Which PCs", width: 2.4 },
        ],
        rows: titles.rows.map((group) => [
          group.name,
          group.installs.length.toLocaleString(),
          group.versions.map((entry) => entry.version).join(", "),
          licenseSummary(group),
          pcNames(group.installs.map((install) => install.pc)),
        ]),
        total: titles.total,
        emptyText: "No software matches these filters.",
      },
      {
        heading: "Installations",
        note: "One line for every copy installed on a PC.",
        columns: [
          { label: "Software", width: 1.4, primary: true },
          { label: "PC", width: 1.4, primary: true },
          { label: "Installed", width: 0.9 },
          { label: "License ends", width: 1.1 },
        ],
        rows: installs.rows.map(({ install }) => [
          `${install.name}\n${install.version ? `Version ${install.version}` : "Version not recorded"}`,
          `${install.pc.name}\n${install.pc.room}`,
          formatReportDay(install.installedAt),
          install.licenseExpiresAt
            ? `${formatReportDay(install.licenseExpiresAt)}\n${licenseStateLabel(licenseState(install.licenseExpiresAt, now))}`
            : "No license date",
        ]),
        total: installs.total,
        emptyText: "No software matches these filters.",
      },
    ],
    csv:
      context.purpose === "csv"
        ? [
            [
              "Software",
              "Version",
              "PC",
              "Asset tag",
              "Room",
              "Installed",
              "License ends",
              "License status",
              "License key hint",
            ],
            ...installs.rows.map(({ install }) => [
              install.name,
              install.version,
              install.pc.name,
              install.pc.assetTag,
              install.pc.room,
              install.installedAt ? manilaDateText(install.installedAt) : "",
              install.licenseExpiresAt ? manilaDateText(install.licenseExpiresAt) : "",
              licenseStateLabel(licenseState(install.licenseExpiresAt, now)),
              install.licenseKeyHint,
            ]),
          ]
        : undefined,
  };
}
