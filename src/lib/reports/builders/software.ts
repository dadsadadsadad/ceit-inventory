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
import { countChart, monthChart, monthSpan, upcomingMonths } from "../charts";
import { capRows, type ReportModel } from "../model";
import { pcNames } from "./hardware";
import { filterNames, type BuilderContext } from "./shared";

const dayMs = 24 * 60 * 60 * 1000;

const licenseChips = {
  expired: "License expired",
  expiring: "License ending within 30 days",
  dated: "Has a license date",
  none: "No license date",
  licensed: "Marked licensed",
  unlicensed: "Marked free or not licensed",
} as const;

function licensedText(value: boolean | null) {
  return value === true ? "Licensed" : value === false ? "Free or not licensed" : "Not set";
}

function licenseSummary(group: SoftwareGroup) {
  if (group.state === "none") {
    return "No license date";
  }
  return group.state === "valid"
    ? `Valid until ${formatReportDay(group.soonestExpiry)}`
    : `${group.state === "expired" ? "Expired" : "Ends"} ${formatReportDay(group.soonestExpiry)}`;
}

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
  const windowEnd = filters.within ? now.getTime() + filters.within * dayMs : null;
  const entries = windowEnd
    ? loaded.entries.filter(
        (entry) =>
          entry.licenseExpiresAt &&
          entry.licenseExpiresAt.getTime() >= now.getTime() &&
          entry.licenseExpiresAt.getTime() <= windowEnd,
      )
    : loaded.entries;
  const groups = sortSoftwareGroups(
    groupSoftware(entries, now),
    filters.license || filters.within ? "expiry" : "name",
  );
  const unlicensed = entries.filter((entry) => entry.isLicensed === false).length;
  const unknown = entries.filter(
    (entry) => entry.isLicensed === null && !entry.licenseExpiresAt,
  ).length;
  const nextQuarter = entries.filter(
    (entry) =>
      entry.licenseExpiresAt &&
      entry.licenseExpiresAt.getTime() >= now.getTime() &&
      entry.licenseExpiresAt.getTime() <= now.getTime() + 90 * dayMs,
  ).length;
  const months = upcomingMonths(now, 12);
  const upcoming = months.map((month): [string, number] => [
    month.label,
    entries.filter(
      (entry) =>
        entry.licenseExpiresAt &&
        entry.licenseExpiresAt >= month.start &&
        entry.licenseExpiresAt < month.end,
    ).length,
  ]);
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
    description: "Installed software and license dates.",
    filters: chips(
      filters.query && `Search: "${filters.query}"`,
      names.location && `Room: ${names.location}`,
      filters.license && licenseChips[filters.license],
      filters.within && `License ending within ${filters.within} days`,
      filters.includeRetired && "Includes retired and lost PCs",
    ),
    generatedAt: now,
    metrics: [
      { label: "Titles", value: groups.length.toLocaleString() },
      { label: "Installations", value: entries.length.toLocaleString() },
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
      {
        label: "Copies ending in 90 days",
        value: nextQuarter.toLocaleString(),
        tone: nextQuarter ? "alert" : undefined,
      },
      {
        label: "Marked not licensed",
        value: unlicensed.toLocaleString(),
        note: "copies",
        tone: unlicensed ? "alert" : undefined,
      },
      {
        label: "No license information",
        value: unknown.toLocaleString(),
        note: "copies with neither a status nor a date",
        tone: unknown ? "alert" : undefined,
      },
    ],
    charts: [
      countChart(
        "Most installed software",
        groups.map((group): [string, number] => [group.name, group.installs.length]),
        "installations",
      ),
      {
        title: "Licenses",
        kind: "bars",
        unit: "titles",
        data: [
          {
            label: "Valid",
            value: groups.filter((group) => group.state === "valid").length,
            tone: "ok",
          },
          { label: "Ending soon", value: expiring, tone: "not_tested" },
          { label: "Expired", value: expired, tone: "defective" },
          {
            label: "No license date",
            value: groups.filter((group) => group.state === "none").length,
            tone: "retired",
          },
        ],
      },
      {
        title: "Is each copy licensed?",
        kind: "bars",
        unit: "copies",
        data: [
          {
            label: "Licensed",
            value: entries.filter((entry) => entry.isLicensed === true).length,
            tone: "ok",
          },
          { label: "Free or not licensed", value: unlicensed, tone: "defective" },
          {
            label: "Not set",
            value: entries.filter((entry) => entry.isLicensed === null).length,
            tone: "retired",
          },
        ],
      },
      monthChart(
        "Licenses ending, next 12 months",
        upcoming,
        "copies",
        `Licenses ending per month, ${monthSpan(months)}.`,
      ),
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
        emptyText: "No software found.",
      },
      {
        heading: "Installations",
        note: "One row per install.",
        columns: [
          { label: "Software", width: 1.4, primary: true },
          { label: "PC", width: 1.4, primary: true },
          { label: "Installed", width: 0.9 },
          { label: "Licensed", width: 0.9 },
          { label: "License ends", width: 1.1 },
        ],
        rows: installs.rows.map(({ install }) => [
          `${install.name}\n${install.version ? `Version ${install.version}` : "Version not recorded"}`,
          `${install.pc.name}\n${install.pc.room}`,
          formatReportDay(install.installedAt),
          licensedText(install.isLicensed),
          install.licenseExpiresAt
            ? `${formatReportDay(install.licenseExpiresAt)}\n${licenseStateLabel(licenseState(install.licenseExpiresAt, now))}`
            : "No license date",
        ]),
        total: installs.total,
        emptyText: "No software found.",
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
              "Licensed",
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
              licensedText(install.isLicensed),
              install.licenseExpiresAt ? manilaDateText(install.licenseExpiresAt) : "",
              licenseStateLabel(licenseState(install.licenseExpiresAt, now)),
              install.licenseKeyHint,
            ]),
          ]
        : undefined,
  };
}
