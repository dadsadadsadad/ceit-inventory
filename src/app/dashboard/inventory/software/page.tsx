export const metadata = { title: "Software · CEIT Inventory" };

import Link from "next/link";

import { ClearFiltersButton, FilterForm } from "@/app/components/filter-form";
import { Pager } from "@/app/components/pager";
import {
  groupSoftware,
  isLicenseFilter,
  licenseState,
  licenseStateLabel,
  sortSoftwareGroups,
  type LicenseState,
  type SoftwareGroup,
  type SoftwareSort,
} from "@/lib/computer-directory";
import { loadSoftware } from "@/lib/computer-queries";
import { isUuid } from "@/lib/ids";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { formatManilaDate } from "@/lib/manila-date";
import { firstParam, pageParam, textParam, type RawParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { InventoryTabs } from "../inventory-tabs";
import { PcChips } from "../pc-chips";

export const dynamic = "force-dynamic";

const pageSize = 20;
const sorts: { label: string; value: SoftwareSort }[] = [
  { value: "name", label: "Name" },
  { value: "installs", label: "Most installed" },
  { value: "expiry", label: "License expiry" },
];
const licenseOptions = [
  { value: "", label: "Any license" },
  { value: "expired", label: "Expired" },
  { value: "expiring", label: "Expiring within 30 days" },
  { value: "dated", label: "Has a license date" },
  { value: "none", label: "No license date" },
  { value: "licensed", label: "Marked licensed" },
  { value: "unlicensed", label: "Marked free or not licensed" },
];

type SearchParams = {
  license?: RawParam;
  location?: RawParam;
  page?: RawParam;
  q?: RawParam;
  retired?: RawParam;
  sort?: RawParam;
};

const stateClass: Record<LicenseState, string> = {
  expired: "status-pill status-pill-critical",
  expiring: "status-pill status-pill-pending",
  valid: "status-pill status-pill-positive",
  none: "status-pill",
};

function date(value: Date | null) {
  return value
    ? formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" })
    : "Not recorded";
}

function LicensePill({ group, now }: { group: SoftwareGroup; now: Date }) {
  if (group.state === "none") {
    return <span className="muted text-sm">No license date</span>;
  }
  return (
    <span className={`${stateClass[group.state]} rounded-md px-2.5 py-1 text-xs font-semibold`}>
      {group.state === "expired" || group.state === "expiring"
        ? `${licenseStateLabel(group.state)} · ${date(group.soonestExpiry)}`
        : `Valid until ${date(group.soonestExpiry)}`}
      <span className="sr-only">
        {" "}
        ({licenseStateLabel(licenseState(group.soonestExpiry, now))})
      </span>
    </span>
  );
}

// Every software title across the PCs, with where it is installed and when licenses end.
export default async function SoftwarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireInventoryAccess();
  const raw = await searchParams;
  const now = new Date();
  const q = textParam(raw.q);
  const locationParam = firstParam(raw.location);
  const location = locationParam && isUuid(locationParam) ? locationParam : "";
  const licenseParam = firstParam(raw.license);
  const license = isLicenseFilter(licenseParam) ? licenseParam : undefined;
  const includeRetired = firstParam(raw.retired) === "1";
  const sortParam = firstParam(raw.sort);
  const sort = sorts.some((entry) => entry.value === sortParam)
    ? (sortParam as SoftwareSort)
    : "name";
  const requestedPage = pageParam(raw.page);

  const [locations, loaded] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadSoftware({ q, location, license, includeRetired }, now),
  ]);
  const groups = sortSoftwareGroups(groupSoftware(loaded.entries, now), sort);
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageGroups = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const expiring = groups.filter((group) => group.state === "expiring").length;
  const expired = groups.filter((group) => group.state === "expired").length;

  function href(overrides: { license?: string; page?: number } = {}) {
    const query = new URLSearchParams();
    const licenseValue = overrides.license ?? license ?? "";
    for (const [key, value] of [
      ["q", q],
      ["location", location],
      ["license", licenseValue],
      ["sort", sort === "name" ? "" : sort],
      ["retired", includeRetired ? "1" : ""],
    ]) {
      if (value) {
        query.set(key, value);
      }
    }
    if (overrides.page && overrides.page > 1) {
      query.set("page", String(overrides.page));
    }
    const text = query.toString();
    return text ? `/dashboard/inventory/software?${text}` : "/dashboard/inventory/software";
  }

  const reportQuery = new URLSearchParams({ kind: "software" });
  for (const [key, value] of [
    ["q", q],
    ["location", location],
    ["license", license ?? ""],
    ["retired", includeRetired ? "1" : ""],
  ]) {
    if (value) {
      reportQuery.set(key, value);
    }
  }

  return (
    <div className="page directory-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Equipment register</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Software</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Every program installed on your PCs, which machines have it, and when licenses end.
              Add software on a PC&apos;s record.
            </p>
          </div>
          <Link
            href={`/dashboard/reports?${reportQuery.toString()}`}
            className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
          >
            Open as report
          </Link>
        </header>

        <InventoryTabs current="software" />

        <section className="directory-stats" aria-label="Software summary">
          <div>
            <span className="muted text-sm">Titles in this view</span>
            <strong>{groups.length.toLocaleString()}</strong>
          </div>
          <div>
            <span className="muted text-sm">Installations</span>
            <strong>{loaded.entries.length.toLocaleString()}</strong>
          </div>
          <div>
            <span className="muted text-sm">Licenses ending soon</span>
            <strong>
              {expiring ? (
                <Link href={href({ license: "expiring" })} className="accent-link">
                  {expiring.toLocaleString()}
                </Link>
              ) : (
                0
              )}
            </strong>
          </div>
          <div>
            <span className="muted text-sm">Licenses expired</span>
            <strong>
              {expired ? (
                <Link href={href({ license: "expired" })} className="accent-link">
                  {expired.toLocaleString()}
                </Link>
              ) : (
                0
              )}
            </strong>
          </div>
        </section>

        <FilterForm label="Software filters" className="filter-spread card rounded-lg p-4">
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input
              name="q"
              defaultValue={q}
              maxLength={120}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Software, version, PC, room, license hint…"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Room</span>
            <select
              name="location"
              defaultValue={location}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">All rooms</option>
              {locations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">License</span>
            <select
              name="license"
              defaultValue={license ?? ""}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              {licenseOptions.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Sort by</span>
            <select
              name="sort"
              defaultValue={sort}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              {sorts.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <ClearFiltersButton className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold" />
          <label className="filter-check flex items-center gap-2 text-sm sm:col-span-2 xl:col-span-5">
            <input
              type="checkbox"
              name="retired"
              value="1"
              defaultChecked={includeRetired}
              className="h-4 w-4"
            />
            Include retired and lost PCs
          </label>
        </FilterForm>

        {loaded.truncated ? (
          <p className="notice rounded-lg px-4 py-3 text-sm" role="status">
            Only the first {loaded.entries.length.toLocaleString()} installations are shown. Narrow
            the search to see the rest.
          </p>
        ) : null}

        {groups.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">
            No software matches these filters. Add installed software on a PC&apos;s record to see
            it here.
          </div>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="Installed software">
            <div className="divider border-b px-5 py-3">
              <p className="muted text-sm">
                {groups.length.toLocaleString()} title{groups.length === 1 ? "" : "s"} · Page{" "}
                {currentPage} of {totalPages}
              </p>
            </div>
            <ul className="directory-list">
              {pageGroups.map((group) => (
                <li key={group.name.toLowerCase()} className="directory-row">
                  <div className="directory-main">
                    <h2 className="directory-value">{group.name}</h2>
                    <p className="muted text-sm">
                      {group.installs.length.toLocaleString()} PC
                      {group.installs.length === 1 ? "" : "s"} ·{" "}
                      {group.versions.length === 1
                        ? `Version ${group.versions[0].version}`
                        : `${group.versions.length} versions`}{" "}
                      · {group.rooms.length} room{group.rooms.length === 1 ? "" : "s"}
                    </p>
                    <div className="mt-2">
                      <LicensePill group={group} now={now} />
                    </div>
                  </div>
                  <div className="directory-pcs">
                    <PcChips pcs={group.installs.map((install) => install.pc)} />
                    <details className="directory-details mt-3">
                      <summary className="accent-link cursor-pointer text-sm font-semibold">
                        Versions and licenses
                      </summary>
                      <div className="record-table mt-3 overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="table-heading divider border-b">
                              {[
                                "PC",
                                "Version",
                                "Installed",
                                "Licensed",
                                "License ends",
                                "License hint",
                              ].map((heading) => (
                                <th
                                  key={heading}
                                  scope="col"
                                  className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.12em]"
                                >
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.installs.map((install) => (
                              <tr key={install.pc.id} className="border-b last:border-0">
                                <td className="px-3 py-3 text-sm">
                                  <Link
                                    href={`/dashboard/inventory/${install.pc.id}`}
                                    className="accent-link font-semibold"
                                  >
                                    {install.pc.name}
                                  </Link>
                                  <span className="muted block text-xs">{install.pc.room}</span>
                                </td>
                                <td className="px-3 py-3 text-sm">
                                  {install.version ?? <span className="muted">Not recorded</span>}
                                </td>
                                <td className="px-3 py-3 text-sm">{date(install.installedAt)}</td>
                                <td className="px-3 py-3 text-sm">
                                  {install.isLicensed === true ? (
                                    "Licensed"
                                  ) : install.isLicensed === false ? (
                                    "Free or not licensed"
                                  ) : (
                                    <span className="muted">Not set</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-sm">
                                  {install.licenseExpiresAt ? (
                                    <span
                                      className={`${stateClass[licenseState(install.licenseExpiresAt, now)]} rounded-md px-2 py-0.5 text-xs font-semibold`}
                                    >
                                      {date(install.licenseExpiresAt)}
                                    </span>
                                  ) : (
                                    <span className="muted">Not recorded</span>
                                  )}
                                </td>
                                <td className="muted px-3 py-3 text-sm">
                                  {install.licenseKeyHint ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
            <Pager
              label="Software"
              currentPage={currentPage}
              totalPages={totalPages}
              hrefForPage={(page) => href({ page })}
            />
          </section>
        )}
      </div>
    </div>
  );
}
