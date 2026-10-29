export const metadata = { title: "Print QR labels · CEIT Inventory" };

import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { Monitor, QrCode, Search } from "lucide-react";

import { EmptyState } from "@/app/components/empty-state";
import { PcLabel } from "@/app/components/pc-label";
import { FilterForm } from "@/app/components/filter-form";
import { Pager } from "@/app/components/pager";
import { isUuid } from "@/lib/ids";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryLabelAppUrl } from "@/lib/inventory-label-url";
import {
  defaultLabelLayout,
  labelLayoutOf,
  labelLayouts,
  labelPages,
  maxAllLabels,
  maxLabelCount,
  selectedLabelIds,
} from "@/lib/label-sheet";
import { defaultPcLabelSize, pcLabelSizeOf, pcLabelSizes } from "@/lib/pc-label";
import { firstParam, pageParam, textParam } from "@/lib/search-params";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";
import { qrWithLogo } from "@/lib/qr-image";
import { prisma } from "@/prisma";

import { LabelItemGrid } from "./label-item-grid";
import { PrintSheet } from "./print-sheet";

export const dynamic = "force-dynamic";

type Search = {
  category?: string | string[];
  created?: string | string[];
  all?: string | string[];
  ids?: string | string[];
  layout?: string | string[];
  location?: string | string[];
  page?: string | string[];
  q?: string | string[];
  size?: string | string[];
  type?: string | string[];
};

const tilesPerPage = 24;

export default async function LabelsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireInventoryAccess();
  const search = await searchParams;
  const ids = selectedLabelIds(search.ids);
  // all=1 picks everything the filters match
  const allMode = firstParam(search.all) === "1";
  const location = firstParam(search.location) ?? "";
  const category = firstParam(search.category) ?? "";
  const layout = labelLayoutOf(firstParam(search.layout));
  // type=pc prints spec labels for computers only
  const pcMode = firstParam(search.type) === "pc";
  const pcSize = pcLabelSizeOf(firstParam(search.size));
  const query = textParam(search.q);
  const created = Number(firstParam(search.created));
  const requestedPage = pageParam(search.page);
  const invalidSelection = ids.length > maxLabelCount || ids.some((id) => !isUuid(id));
  const invalidFilter =
    Boolean(location && !isUuid(location)) || Boolean(category && !isUuid(category));
  const selection = invalidSelection ? [] : ids;
  const filtered = Boolean(query || location || category);

  const where: Prisma.InventoryItemWhereInput = invalidFilter
    ? { id: { in: [] } }
    : {
        AND: [
          { status: { not: "RETIRED" } },
          pcMode ? { isComputer: true } : {},
          location ? { locationId: location } : {},
          category ? { categoryId: category } : {},
          ...everyTermMatches<Prisma.InventoryItemWhereInput>(searchTerms(query), (term) => [
            { name: { contains: term, mode: "insensitive" } },
            { assetTag: { contains: term, mode: "insensitive" } },
            { serialNumber: { contains: term, mode: "insensitive" } },
            { qrCode: { contains: term, mode: "insensitive" } },
          ]),
        ],
      };
  // tags are zero padded so string order works
  const order: Prisma.InventoryItemOrderByWithRelationInput[] = [
    { assetTag: { sort: "asc", nulls: "last" } },
    { name: "asc" },
    { id: "asc" },
  ];

  const [locations, categories, totalMatching, requestHeaders, chosen] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.inventoryItem.count({ where }),
    headers(),
    allMode || selection.length
      ? prisma.inventoryItem.findMany({
          where: allMode
            ? where
            : { id: { in: selection }, ...(pcMode ? { isComputer: true } : {}) },
          take: maxAllLabels,
          include: {
            location: { select: { name: true } },
            computer: { include: { software: { orderBy: { name: "asc" } } } },
            maintenanceTickets: {
              where: { resolvedAt: { not: null } },
              select: { resolvedAt: true },
              orderBy: { resolvedAt: "desc" },
              take: 1,
            },
          },
          orderBy: [{ assetTag: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalMatching / tilesPerPage));
  const currentPage = Math.min(requestedPage, totalPages);
  const [tiles, matching] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        assetTag: true,
        isComputer: true,
        location: { select: { name: true } },
        category: { select: { name: true } },
        photos: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: order,
      skip: (currentPage - 1) * tilesPerPage,
      take: tilesPerPage,
    }),
    totalMatching <= maxAllLabels
      ? prisma.inventoryItem.findMany({ where, select: { id: true }, orderBy: order })
      : Promise.resolve(null),
  ]);

  const appUrl = inventoryLabelAppUrl(
    process.env.NEXT_PUBLIC_APP_URL,
    requestHeaders,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );
  const labels = appUrl
    ? await Promise.all(
        chosen.map(async (item) => ({
          ...item,
          image: await qrWithLogo(
            `${appUrl}/scan/${encodeURIComponent(item.qrCode)}`,
            layout === "poster" || (pcMode && pcSize === "large") ? 720 : 320,
          ),
        })),
      )
    : [];

  // keep the selection and size, drop the filters
  const linkFor = (changes: Record<string, string | number | undefined>) => {
    const values: Record<string, string | number | undefined> = {
      q: query,
      location,
      category,
      type: pcMode ? "pc" : undefined,
      layout: pcMode || layout === defaultLabelLayout ? undefined : layout,
      size: pcMode && pcSize !== defaultPcLabelSize ? pcSize : undefined,
      ids: allMode ? undefined : selection.join(","),
      all: allMode ? "1" : undefined,
      ...changes,
    };
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== "" && !(key === "page" && value === 1)) {
        parameters.set(key, String(value));
      }
    }
    const text = parameters.toString();
    return text ? `/dashboard/inventory/labels?${text}` : "/dashboard/inventory/labels";
  };
  const showAll = linkFor({ q: undefined, location: undefined, category: undefined });
  // switching type clears the picks since pc labels only take computers
  const typeLink = (pc: boolean) =>
    linkFor({
      type: pc ? "pc" : undefined,
      ids: undefined,
      all: undefined,
      page: undefined,
      size: undefined,
    });
  const lastService = (item: (typeof labels)[number]) => {
    const resolved = item.maintenanceTickets[0]?.resolvedAt ?? null;
    const checked = item.lastCheckedAt;
    return resolved && (!checked || resolved > checked) ? resolved : checked;
  };

  return (
    <div className={`page label-sheet-page ${pcMode ? "pc-label-page" : `label-layout-${layout}`}`}>
      <div className="page-inner space-y-6">
        <header className="no-print flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">
              ← Inventory
            </Link>
            <h1 className="title mt-4 text-3xl">{pcMode ? "PC labels" : "QR labels"}</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              {pcMode
                ? "Spec labels for PC cases with hardware, software and a QR code."
                : "Pick items, choose a size and print."}
            </p>
            <nav className="view-switch mt-4" aria-label="Label type">
              <Link
                href={typeLink(false)}
                className="view-switch-option"
                aria-current={pcMode ? undefined : "true"}
              >
                <QrCode size={16} aria-hidden="true" />
                QR labels
              </Link>
              <Link
                href={typeLink(true)}
                className="view-switch-option"
                aria-current={pcMode ? "true" : undefined}
              >
                <Monitor size={16} aria-hidden="true" />
                PC labels
              </Link>
            </nav>
          </div>
          {labels.length ? <PrintSheet ids={labels.map((item) => item.id)} /> : null}
        </header>

        {Number.isInteger(created) && created > 0 ? (
          <div
            className="notice notice-success no-print rounded-lg px-5 py-4 text-sm"
            role="status"
          >
            {created} item{created === 1 ? "" : "s"} created. Their labels are selected below.
          </div>
        ) : null}

        <section className="no-print card overflow-hidden rounded-lg" aria-label="Choose labels">
          <FilterForm label="Label filters" className="label-picker p-5">
            {allMode ? <input type="hidden" name="all" value="1" /> : null}
            {!allMode && selection.length ? (
              <input type="hidden" name="ids" value={selection.join(",")} />
            ) : null}
            {pcMode ? <input type="hidden" name="type" value="pc" /> : null}
            <label className="label-picker-search">
              <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
              <input
                type="search"
                enterKeyHint="search"
                aria-keyshortcuts="/"
                name="q"
                defaultValue={query}
                maxLength={120}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                placeholder="Name, tag or serial"
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
                {locations.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted text-xs font-bold uppercase tracking-wide">Category</span>
              <select
                name="category"
                defaultValue={category}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            {pcMode ? (
              <label>
                <span className="muted text-xs font-bold uppercase tracking-wide">Label size</span>
                <select
                  name="size"
                  defaultValue={pcSize === defaultPcLabelSize ? "" : pcSize}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                >
                  {Object.entries(pcLabelSizes).map(([key, value]) => (
                    <option key={key} value={key === defaultPcLabelSize ? "" : key}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                <span className="muted text-xs font-bold uppercase tracking-wide">Label size</span>
                <select
                  name="layout"
                  defaultValue={layout === defaultLabelLayout ? "" : layout}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                >
                  {Object.entries(labelLayouts).map(([key, value]) => (
                    <option key={key} value={key === defaultLabelLayout ? "" : key}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {filtered ? (
              <p className="label-picker-reset text-sm">
                <Link className="accent-link font-semibold" href={showAll}>
                  Show all items
                </Link>
              </p>
            ) : null}
          </FilterForm>

          <div className="divider border-t p-5">
            <LabelItemGrid
              items={tiles.map((item) => ({
                id: item.id,
                name: item.name,
                assetTag: item.assetTag,
                isComputer: item.isComputer,
                photoId: item.photos[0]?.id ?? null,
                location: item.location.name,
                category: item.category.name,
              }))}
              matchingIds={matching ? matching.map((item) => item.id) : null}
              max={maxLabelCount}
              maxAll={maxAllLabels}
              allMode={allMode}
              selected={selection}
              totalMatching={totalMatching}
            />
            {!tiles.length ? (
              <EmptyState icon={Search} title={pcMode ? "No PCs found." : "No items found."}>
                <Link className="accent-link font-semibold" href={showAll}>
                  Show all items
                </Link>
              </EmptyState>
            ) : null}
          </div>
          <Pager
            label="Items"
            currentPage={currentPage}
            totalPages={totalPages}
            hrefForPage={(page) => linkFor({ page })}
          />
        </section>

        {invalidSelection || invalidFilter ? (
          <p className="notice no-print rounded-lg p-4" role="alert">
            Some selected items couldn&apos;t be loaded. Pick them again (up to {maxLabelCount}{" "}
            labels at a time).
          </p>
        ) : null}
        {!appUrl ? (
          <p className="notice no-print rounded-lg p-4" role="alert">
            The site URL isn&apos;t set yet. Ask an admin to set it before printing.
          </p>
        ) : null}
        {labels.length ? (
          <section aria-label="Label preview" className="space-y-3">
            <h2 className="no-print text-lg font-semibold">Preview</h2>
            <p className="muted no-print text-sm">
              {labels.length} label{labels.length === 1 ? "" : "s"} ·{" "}
              {pcMode
                ? pcLabelSizes[pcSize].name.toLowerCase()
                : `${labelLayouts[layout].name.split(" ·")[0]} code`}{" "}
              · A4 · print at 100% with headers and footers off
            </p>
            {pcMode ? (
              <div className="label-sheet-preview">
                <section
                  className={`pc-label-sheet pc-label-sheet-${pcSize}`}
                  aria-label="PC labels"
                >
                  {labels.map((item) => (
                    <PcLabel
                      key={item.id}
                      size={pcSize}
                      item={{
                        ...item,
                        lastServiceAt: lastService(item),
                        software: item.computer?.software ?? [],
                      }}
                    />
                  ))}
                </section>
              </div>
            ) : (
              <div className="label-sheet-preview">
                {labelPages(labels, labelLayouts[layout].perPage).map((sheet, index) => (
                  <section
                    className="label-sheet"
                    aria-label={`Label sheet ${index + 1}`}
                    key={index}
                  >
                    {sheet.map((item) => (
                      <article className="sheet-label" key={item.id}>
                        {/* eager so every code is loaded before printing */}
                        <Image
                          unoptimized
                          loading="eager"
                          src={item.image}
                          alt={`QR code for ${item.assetTag ?? item.name}`}
                          width={320}
                          height={320}
                        />
                        <div>
                          <p className="sheet-label-brand">CEIT</p>
                          <h2>{item.name}</h2>
                          <p className="sheet-label-tag">{item.assetTag ?? item.qrCode}</p>
                          <p>{item.location.name}</p>
                          <p className="sheet-label-hint">
                            {item.itemType === "ASSET"
                              ? "Scan to borrow or report"
                              : "Scan to view or report"}
                          </p>
                        </div>
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </section>
        ) : appUrl ? (
          <div className="no-print">
            <EmptyState icon={QrCode} title="No labels selected yet.">
              {pcMode
                ? "Click PCs above to add their labels."
                : "Click items above to add their labels."}
            </EmptyState>
          </div>
        ) : null}
      </div>
    </div>
  );
}
