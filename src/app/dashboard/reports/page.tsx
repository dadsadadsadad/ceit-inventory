export const metadata = { title: "Reports · CEIT Inventory" };

import Link from "next/link";

import { AuditAction, ItemCondition, ItemStatus, ItemType } from "@prisma/client";

import { auditActionLabel, auditViewLabel, auditViews } from "@/lib/audit-trail";
import { hardwareComponents, licenseFilters } from "@/lib/computer-directory";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import {
  borrowingReportStateLabel,
  borrowingReportStates,
  exportPeriods,
} from "@/lib/report-export-filters";
import { buildReport } from "@/lib/reports/build";
import { humanize } from "@/lib/reports/format";
import { quickReports } from "@/lib/reports/kinds";
import { ReportRequestError, type ReportModel } from "@/lib/reports/model";
import { firstParam, type RawParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { PrintButton } from "@/app/components/print-button";

import { ReportBuilder, type ReportBuilderOptions } from "./report-builder";
import { ReportSheet } from "./report-sheet";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, RawParam>;

const periodLabels: Record<(typeof exportPeriods)[number], string> = {
  all: "All time",
  today: "Today",
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "this-year": "This year",
};

const licenseLabels: Record<(typeof licenseFilters)[number], string> = {
  expired: "Expired",
  expiring: "Ending within 30 days",
  dated: "Has a license date",
  none: "No license date",
  licensed: "Marked licensed",
  unlicensed: "Marked free or not licensed",
};

function options<T extends string>(values: readonly T[], label: (value: T) => string) {
  return values.map((value) => ({ value, label: label(value) }));
}

// Choose a report, narrow it down, generate it here, then download it as PDF or CSV.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireInventoryAccess();
  const search = await searchParams;
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const selected = firstParam(value);
    if (selected) {
      parameters.set(key, selected);
    }
  }
  const generate = parameters.get("generate") === "1";
  parameters.delete("generate");

  const [categories, locations] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const builderOptions: ReportBuilderOptions = {
    actions: options(Object.values(AuditAction), auditActionLabel),
    auditViews: options(auditViews, auditViewLabel),
    borrowingStates: options(borrowingReportStates, borrowingReportStateLabel).filter(
      (entry) => entry.value !== "all",
    ),
    categories: categories.map((entry) => ({ value: entry.id, label: entry.name })),
    components: options(
      hardwareComponents.map((entry) => entry.value),
      (value) => hardwareComponents.find((entry) => entry.value === value)?.label ?? value,
    ),
    conditions: options(Object.values(ItemCondition), humanize),
    inventoryStatuses: options(Object.values(ItemStatus), inventoryStatusLabel),
    itemTypes: options(Object.values(ItemType), (value) =>
      value === "ASSET" ? "Equipment" : "Supplies",
    ),
    licenses: options(licenseFilters, (value) => licenseLabels[value]),
    locations: locations.map((entry) => ({ value: entry.id, label: entry.name })),
    maintenancePriorities: options(["LOW", "NORMAL", "HIGH", "URGENT"], humanize),
    maintenanceSources: [
      { value: "QR", label: "QR issue reports" },
      { value: "STAFF", label: "Staff" },
    ],
    maintenanceStatuses: [
      { value: "OPEN", label: "Needs attention" },
      { value: "RESOLVED", label: "Resolved" },
    ],
    periods: options(exportPeriods, (value) => periodLabels[value]),
    stockLevels: [
      { value: "low", label: "Running low or out" },
      { value: "out", label: "Out of stock only" },
    ],
    warranties: [
      { value: "ending", label: "Ending within 60 days" },
      { value: "expired", label: "Warranty ended" },
      { value: "active", label: "Still covered" },
      { value: "none", label: "No warranty recorded" },
    ],
  };

  let report: ReportModel | null = null;
  let problem: string | null = null;
  if (generate) {
    try {
      report = await buildReport(parameters, "preview");
    } catch (error) {
      if (error instanceof ReportRequestError) {
        problem = error.message;
      } else {
        console.error("Unable to build report", error);
        problem = "The report could not be built. Check the database connection and try again.";
      }
    }
  }

  const query = parameters.toString();
  const downloads = (path: string) => (query ? `${path}?${query}` : path);
  const initial = Object.fromEntries(parameters.entries());

  return (
    <div className="page reports-page">
      <div className="page-inner space-y-6">
        <header>
          <p className="eyebrow">Department records</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Reports</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Pick a report, narrow it down, and generate it right here. When it looks right, print it
            on the spot, download a PDF to share, or take a CSV for a spreadsheet.
          </p>
        </header>

        <ReportBuilder key={JSON.stringify(initial)} initial={initial} options={builderOptions} />

        {problem ? (
          <div className="notice rounded-lg px-5 py-4 text-sm" role="alert">
            {problem}
          </div>
        ) : null}

        {report ? (
          <ReportSheet
            report={report}
            actions={
              <>
                <a
                  href={downloads("/dashboard/reports/export/pdf")}
                  className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  Download PDF
                </a>
                <a
                  href={downloads("/dashboard/reports/export")}
                  className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  Download CSV
                </a>
                <PrintButton />
              </>
            }
          />
        ) : !problem ? (
          <section aria-labelledby="quick-reports-heading" className="space-y-3">
            <div>
              <h2 id="quick-reports-heading" className="text-lg font-semibold">
                Quick reports
              </h2>
              <p className="muted text-sm">Common questions, ready to generate in one click.</p>
            </div>
            <ul className="quick-reports">
              {quickReports.map((quick) => (
                <li key={quick.label}>
                  <Link
                    href={`/dashboard/reports?${new URLSearchParams({ ...quick.query, generate: "1" })}`}
                    className="quick-report card card-link"
                  >
                    <strong>{quick.label}</strong>
                    <span className="muted text-sm">{quick.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
