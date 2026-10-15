export const metadata = { title: "Print QR labels · CEIT Inventory" };

import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { QrCode, Search } from "lucide-react";
import QRCode from "qrcode";

import { EmptyState } from "@/app/components/empty-state";
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
  maxLabelCount,
  selectedLabelIds,
} from "@/lib/label-sheet";
import { firstParam, pageParam, textParam } from "@/lib/search-params";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";
import { prisma } from "@/prisma";

import { LabelItemGrid } from "./label-item-grid";
import { PrintSheet } from "./print-sheet";

export const dynamic = "force-dynamic";

type Search = {
  category?: string | string[];
  created?: string | string[];
  ids?: string | string[];
  layout?: string | string[];
  location?: string | string[];
  page?: string | string[];
  q?: string | string[];
};

const tilesPerPage = 24;

export default async function LabelsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireInventoryAccess();
  const search = await searchParams;
  const ids = selectedLabelIds(search.ids);
  const location = firstParam(search.location) ?? "";
  const category = firstParam(search.category) ?? "";
  const layout = labelLayoutOf(firstParam(search.layout));
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
    selection.length
      ? prisma.inventoryItem.findMany({
          where: { id: { in: selection } },
          include: { location: { select: { name: true } } },
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
    totalMatching <= maxLabelCount
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
          image: await QRCode.toDataURL(`${appUrl}/scan/${encodeURIComponent(item.qrCode)}`, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: layout === "poster" ? 720 : 320,
          }),
        })),
      )
    : [];

  // keep the selection and size, drop the filters
  const linkFor = (changes: Record<string, string | number | undefined>) => {
    const values: Record<string, string | number | undefined> = {
      q: query,
      location,
      category,
      layout: layout === defaultLabelLayout ? undefined : layout,
      ids: selection.join(","),
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

  return (
    <div className={`page label-sheet-page label-layout-${layout}`}>
      <div className="page-inner space-y-6">
        <header className="no-print flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">
              ← Inventory
            </Link>
            <p className="eyebrow mt-5">Printing</p>
            <h1 className="title mt-3 text-3xl">QR labels</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Pick items, choose a size and print.
            </p>
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
            {selection.length ? (
              <input type="hidden" name="ids" value={selection.join(",")} />
            ) : null}
            <label className="label-picker-search">
              <span className="block text-sm font-semibold">Search</span>
              <span className="label-search mt-2">
                <Search size={16} aria-hidden="true" />
                <input
                  name="q"
                  type="search"
                  defaultValue={query}
                  maxLength={120}
                  className="field w-full rounded-lg py-2.5 pr-3 text-sm"
                  placeholder="Name, tag or serial"
                />
              </span>
            </label>
            <label>
              <span className="block text-sm font-semibold">Room</span>
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
              <span className="block text-sm font-semibold">Category</span>
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
            <label>
              <span className="block text-sm font-semibold">Label size</span>
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
              selected={selection}
              totalMatching={totalMatching}
            />
            {!tiles.length ? (
              <EmptyState icon={Search} title="No items found.">
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
              {labelLayouts[layout].name.split(" ·")[0]} code · A4 · print at 100% with headers and
              footers off
            </p>
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
          </section>
        ) : appUrl ? (
          <div className="no-print">
            <EmptyState icon={QrCode} title="No labels selected yet.">
              Click items above to add their labels.
            </EmptyState>
          </div>
        ) : null}
      </div>
    </div>
  );
}
