export const metadata = { title: "Hardware · CEIT Inventory" };

import Link from "next/link";
import type { CSSProperties } from "react";

import { ClearFiltersButton, FilterForm } from "@/app/components/filter-form";
import { Pager } from "@/app/components/pager";
import {
  componentValue,
  groupHardware,
  hardwareComponents,
  isHardwareComponent,
  isIncompleteProfile,
} from "@/lib/computer-directory";
import { loadComputers } from "@/lib/computer-queries";
import { isUuid } from "@/lib/ids";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { firstParam, pageParam, textParam, type RawParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

import { InventoryTabs } from "../inventory-tabs";
import { PcChips } from "../pc-chips";

export const dynamic = "force-dynamic";

const pageSize = 25;

type SearchParams = {
  component?: RawParam;
  incomplete?: RawParam;
  location?: RawParam;
  page?: RawParam;
  q?: RawParam;
  retired?: RawParam;
  view?: RawParam;
};

// Every PC's hardware, grouped by component or listed one PC at a time.
export default async function HardwarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireInventoryAccess();
  const raw = await searchParams;
  const q = textParam(raw.q);
  const locationParam = firstParam(raw.location);
  const location = locationParam && isUuid(locationParam) ? locationParam : "";
  const includeRetired = firstParam(raw.retired) === "1";
  const onlyIncomplete = firstParam(raw.incomplete) === "1";
  const mode = firstParam(raw.view) === "pcs" ? "pcs" : "components";
  const componentParam = firstParam(raw.component);
  const component = isHardwareComponent(componentParam) ? componentParam : "processor";
  const requestedPage = pageParam(raw.page);

  const [locations, loaded] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadComputers({ q, location, includeRetired }),
  ]);
  const allComputers = loaded.computers;
  const computers = onlyIncomplete ? allComputers.filter(isIncompleteProfile) : allComputers;
  const incompleteCount = allComputers.filter(isIncompleteProfile).length;
  const rooms = new Set(computers.map((entry) => entry.pc.room)).size;
  const groups = mode === "components" ? groupHardware(computers, component) : [];

  const totalPages = Math.max(1, Math.ceil(computers.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pagePcs = computers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function hrefForPage(page: number) {
    const query = new URLSearchParams();
    for (const [key, value] of [
      ["q", q],
      ["location", location],
      ["retired", includeRetired ? "1" : ""],
      ["incomplete", onlyIncomplete ? "1" : ""],
      ["view", mode === "pcs" ? "pcs" : ""],
    ]) {
      if (value) {
        query.set(key, value);
      }
    }
    if (page > 1) {
      query.set("page", String(page));
    }
    const text = query.toString();
    return text ? `/dashboard/inventory/hardware?${text}` : "/dashboard/inventory/hardware";
  }

  const reportQuery = new URLSearchParams({ kind: "hardware" });
  if (q) {
    reportQuery.set("q", q);
  }
  if (location) {
    reportQuery.set("location", location);
  }
  if (includeRetired) {
    reportQuery.set("retired", "1");
  }
  if (onlyIncomplete) {
    reportQuery.set("incomplete", "1");
  }
  if (mode === "components") {
    reportQuery.set("component", component);
  }

  return (
    <div className="page directory-page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Equipment register</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">Hardware</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              See what hardware your PCs have and which machines share it. Details come from each
              PC&apos;s record.
            </p>
          </div>
          <Link
            href={`/dashboard/reports?${reportQuery.toString()}`}
            className="secondary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold"
          >
            Open as report
          </Link>
        </header>

        <InventoryTabs current="hardware" />

        <section className="directory-stats" aria-label="Hardware summary">
          <div>
            <span className="muted text-sm">PCs in this view</span>
            <strong>{computers.length.toLocaleString()}</strong>
          </div>
          <div>
            <span className="muted text-sm">Rooms</span>
            <strong>{rooms.toLocaleString()}</strong>
          </div>
          <div>
            <span className="muted text-sm">Profiles missing details</span>
            <strong>{incompleteCount.toLocaleString()}</strong>
          </div>
        </section>

        <FilterForm
          label="Hardware filters"
          className="card grid gap-3 rounded-lg p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] xl:items-end"
        >
          <label className="sm:col-span-2 xl:col-span-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input
              name="q"
              defaultValue={q}
              maxLength={120}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Processor, memory, graphics, OS, PC name, room, MAC…"
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
          <ClearFiltersButton className="card card-link rounded-lg px-4 py-2.5 text-sm font-semibold" />

          <fieldset className="filter-chips sm:col-span-2 xl:col-span-3" aria-label="Show hardware">
            <legend className="sr-only">Show hardware</legend>
            {[
              ["components", "By component"],
              ["pcs", "By PC"],
            ].map(([value, label]) => (
              <label key={value} className="filter-chip">
                <input type="radio" name="view" value={value} defaultChecked={mode === value} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {mode === "components" ? (
            <fieldset
              className="filter-chips sm:col-span-2 xl:col-span-3"
              aria-label="Hardware component"
            >
              <legend className="sr-only">Hardware component</legend>
              {hardwareComponents.map((entry) => (
                <label key={entry.value} className="filter-chip">
                  <input
                    type="radio"
                    name="component"
                    value={entry.value}
                    defaultChecked={component === entry.value}
                  />
                  <span>{entry.label}</span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2 xl:col-span-3">
            <label className="filter-check flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="incomplete"
                value="1"
                defaultChecked={onlyIncomplete}
                className="h-4 w-4"
              />
              Only PCs missing details
            </label>
            <label className="filter-check flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="retired"
                value="1"
                defaultChecked={includeRetired}
                className="h-4 w-4"
              />
              Include retired and lost PCs
            </label>
          </div>
        </FilterForm>

        {loaded.truncated ? (
          <p className="notice rounded-lg px-4 py-3 text-sm" role="status">
            Only the first {allComputers.length.toLocaleString()} PCs are shown. Narrow the search
            to see the rest.
          </p>
        ) : null}

        {computers.length === 0 ? (
          <div className="notice rounded-lg px-5 py-4 text-sm">
            No PCs match these filters. Mark equipment as a PC and add its hardware details on its
            record to see it here.
          </div>
        ) : mode === "components" ? (
          <section
            className="card overflow-hidden rounded-lg"
            aria-label={`PCs grouped by ${component}`}
          >
            <div className="divider flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <p className="muted text-sm">
                {groups.filter((group) => group.recorded).length.toLocaleString()} different{" "}
                {hardwareComponents.find((entry) => entry.value === component)?.label.toLowerCase()}{" "}
                values across {computers.length.toLocaleString()} PCs
              </p>
            </div>
            <ul className="directory-list">
              {groups.map((group) => (
                <li
                  key={group.value}
                  className={`directory-row ${group.recorded ? "" : "is-unrecorded"}`}
                >
                  <div className="directory-main">
                    <h2 className="directory-value">{group.value}</h2>
                    <p className="muted text-sm">
                      {group.count.toLocaleString()} PC{group.count === 1 ? "" : "s"}
                      {group.recorded ? "" : " · add these details on each PC's record"}
                    </p>
                    <span
                      className="directory-share"
                      aria-hidden="true"
                      style={{ "--share": group.count / computers.length } as CSSProperties}
                    />
                  </div>
                  <PcChips pcs={group.pcs} />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="card overflow-hidden rounded-lg" aria-label="PCs and their hardware">
            <div className="divider border-b px-5 py-3">
              <p className="muted text-sm">
                {computers.length.toLocaleString()} PC{computers.length === 1 ? "" : "s"} · Page{" "}
                {currentPage} of {totalPages}
              </p>
            </div>
            <div className="record-table overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-heading divider border-b">
                    {["PC", "Room", "Processor", "Memory", "Storage", "Graphics", "System"].map(
                      (heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="px-5 py-4 text-left text-xs font-bold uppercase tracking-[0.16em]"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pagePcs.map((entry) => (
                    <tr key={entry.pc.id} className="table-row border-b align-top last:border-0">
                      <td className="px-5 py-4 text-sm">
                        <Link
                          href={`/dashboard/inventory/${entry.pc.id}`}
                          className="accent-link font-semibold"
                        >
                          {entry.pc.name}
                        </Link>
                        <div className="muted asset-code mt-1 text-xs">
                          {entry.pc.assetTag ?? "No asset tag"}
                        </div>
                      </td>
                      <td className="muted px-5 py-4 text-sm">{entry.pc.room}</td>
                      {(["processor", "memory", "storage", "graphics", "os"] as const).map(
                        (key) => {
                          const value = componentValue(entry, key);
                          return (
                            <td key={key} className="px-5 py-4 text-sm">
                              {value ?? <span className="muted">Not recorded</span>}
                            </td>
                          );
                        },
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              label="Hardware"
              currentPage={currentPage}
              totalPages={totalPages}
              hrefForPage={hrefForPage}
            />
          </section>
        )}
      </div>
    </div>
  );
}
