export const metadata = { title: "Print QR labels · CEIT Inventory" };

import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { QrCode, Search } from "lucide-react";
import QRCode from "qrcode";

import { EmptyState } from "@/app/components/empty-state";
import { FilterForm } from "@/app/components/filter-form";
import { isUuid } from "@/lib/ids";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryLabelAppUrl } from "@/lib/inventory-label-url";
import {
  labelLayoutOf,
  labelLayouts,
  labelPages,
  maximumLabelCount,
  selectedLabelIds,
} from "@/lib/label-sheet";
import { firstParam, textParam } from "@/lib/search-params";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";
import { prisma } from "@/prisma";

import { PrintSheet } from "./print-sheet";

export const dynamic = "force-dynamic";

type Search = {
  category?: string | string[];
  created?: string | string[];
  ids?: string | string[];
  layout?: string | string[];
  location?: string | string[];
  q?: string | string[];
};

const searchResultLimit = 25;
const itemSummary = { location: { select: { name: true } } } as const;

// Choose labels by room, category, or item by item, and lay them out on printable sheets.
export default async function LabelsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireInventoryAccess();
  const search = await searchParams;
  const ids = selectedLabelIds(search.ids);
  const location = firstParam(search.location) ?? "";
  const category = firstParam(search.category) ?? "";
  const layout = labelLayoutOf(firstParam(search.layout));
  const query = textParam(search.q);
  const created = Number(firstParam(search.created));
  const invalid =
    ids.length > maximumLabelCount ||
    ids.some((id) => !isUuid(id)) ||
    Boolean(location && !isUuid(location)) ||
    Boolean(category && !isUuid(category));

  // A room and a category narrow the search, and print everything in them when nothing is picked.
  const scope: Prisma.InventoryItemWhereInput = {
    status: { not: "RETIRED" },
    ...(location ? { locationId: location } : {}),
    ...(category ? { categoryId: category } : {}),
  };
  const terms = searchTerms(query);

  const [locations, categories, picked, scoped, results, requestHeaders] = await Promise.all([
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
    !invalid && ids.length
      ? prisma.inventoryItem.findMany({
          where: { id: { in: ids } },
          include: itemSummary,
          orderBy: [{ assetTag: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    !invalid && !ids.length && (location || category)
      ? prisma.inventoryItem.findMany({
          where: scope,
          include: itemSummary,
          orderBy: [{ assetTag: "asc" }, { id: "asc" }],
          take: maximumLabelCount + 1,
        })
      : Promise.resolve([]),
    !invalid && terms.length
      ? prisma.inventoryItem.findMany({
          where: {
            AND: [
              scope,
              { id: { notIn: ids } },
              ...everyTermMatches<Prisma.InventoryItemWhereInput>(terms, (term) => [
                { name: { contains: term, mode: "insensitive" } },
                { assetTag: { contains: term, mode: "insensitive" } },
                { serialNumber: { contains: term, mode: "insensitive" } },
                { qrCode: { contains: term, mode: "insensitive" } },
              ]),
            ],
          },
          include: itemSummary,
          orderBy: [{ name: "asc" }, { assetTag: "asc" }],
          take: searchResultLimit,
        })
      : Promise.resolve([]),
    headers(),
  ]);

  const items = ids.length ? picked : scoped;
  const appUrl = inventoryLabelAppUrl(
    process.env.NEXT_PUBLIC_APP_URL,
    requestHeaders,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );
  const tooMany = items.length > maximumLabelCount;
  const labels =
    appUrl && !invalid && !tooMany
      ? await Promise.all(
          items.map(async (item) => ({
            ...item,
            image: await QRCode.toDataURL(`${appUrl}/scan/${encodeURIComponent(item.qrCode)}`, {
              errorCorrectionLevel: "M",
              margin: 1,
              width: layout === "poster" ? 720 : 320,
            }),
          })),
        )
      : [];

  // The page without any picked items, keeping the other choices.
  const withoutPicks = new URLSearchParams(
    Object.entries({ location, category, layout }).filter(
      ([key, value]) => value && !(key === "layout" && value === "compact"),
    ),
  ).toString();

  return (
    <div className={`page label-sheet-page label-layout-${layout}`}>
      <div className="page-inner space-y-6">
        {/* Label-sheet title and print controls. */}
        <header className="no-print flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">
              ← Inventory
            </Link>
            <p className="eyebrow mt-5">Printing</p>
            <h1 className="title mt-3 text-3xl">QR labels</h1>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Print many labels at once: a whole room or category, or items you pick one by one.
              Choose a size, check the preview, then print.
            </p>
          </div>
          {labels.length ? <PrintSheet ids={labels.map((item) => item.id)} /> : null}
        </header>

        {Number.isInteger(created) && created > 0 ? (
          <div
            className="notice notice-success no-print rounded-lg px-5 py-4 text-sm"
            role="status"
          >
            {created} item{created === 1 ? "" : "s"} created, each with its own asset tag and QR
            code. Their labels are ready below.
          </div>
        ) : null}

        {/* Choose what to print and how big. Choices apply as soon as they are made. */}
        <FilterForm label="Label filters" className="no-print card label-picker rounded-lg p-5">
          <div className="label-picker-row">
            <label>
              <span className="block text-sm font-semibold">Room</span>
              <select
                name="location"
                defaultValue={location}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">Any room</option>
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
                <option value="">Any category</option>
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
                defaultValue={layout}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {Object.entries(labelLayouts).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="label-picker-items">
            <label>
              <span className="block text-sm font-semibold">Pick items one by one</span>
              <span className="label-search mt-2">
                <Search size={16} aria-hidden="true" />
                <input
                  name="q"
                  type="search"
                  defaultValue={query}
                  maxLength={120}
                  className="field w-full rounded-lg py-2.5 pr-3 text-sm"
                  placeholder="Search by name, asset tag, or serial number"
                />
              </span>
            </label>

            {picked.length ? (
              <fieldset className="label-choice-group">
                <legend className="text-sm font-semibold">
                  {picked.length} picked ·{" "}
                  <Link
                    className="accent-link"
                    href={`/dashboard/inventory/labels${withoutPicks ? `?${withoutPicks}` : ""}`}
                  >
                    Clear picked items
                  </Link>
                </legend>
                <div className="filter-chips">
                  {picked.map((item) => (
                    <label key={item.id} className="filter-chip">
                      <input type="checkbox" name="ids" value={item.id} defaultChecked />
                      <span>
                        {item.name}
                        {item.assetTag ? ` · ${item.assetTag}` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {terms.length ? (
              <fieldset className="label-choice-group">
                <legend className="muted text-sm">
                  {results.length
                    ? `Tap to add${results.length === searchResultLimit ? ` (first ${searchResultLimit} matches)` : ""}`
                    : "No other items match this search."}
                </legend>
                <div className="filter-chips">
                  {results.map((item) => (
                    <label key={item.id} className="filter-chip label-result">
                      <input type="checkbox" name="ids" value={item.id} />
                      <span>
                        + {item.name}
                        {item.assetTag ? ` · ${item.assetTag}` : ""}
                        <small> · {item.location.name}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <p className="muted text-sm leading-6">
              {picked.length
                ? "Only the picked items are printed. Clear them to print a whole room or category."
                : "Leave this empty to print everything in the chosen room or category."}
            </p>
          </div>

          <button className="secondary-button justify-self-start rounded-lg px-4 py-2.5 text-sm font-semibold">
            Preview labels
          </button>
        </FilterForm>

        {invalid || tooMany ? (
          <p className="notice no-print rounded-lg p-4" role="alert">
            {tooMany
              ? `That is more than ${maximumLabelCount} labels. Choose a room and a category together, or pick items one by one.`
              : `Select up to ${maximumLabelCount} valid items to print a batch.`}
          </p>
        ) : null}
        {!appUrl ? (
          <p className="notice no-print rounded-lg p-4" role="alert">
            The website address for QR labels hasn’t been configured. Ask your administrator to set
            it before printing.
          </p>
        ) : null}
        {labels.length ? (
          <>
            <p className="muted no-print text-sm">
              {labels.length} label{labels.length === 1 ? "" : "s"} ·{" "}
              {labelLayouts[layout].name.split(" ·")[0]} code · A4 paper · Print at 100% scale with
              browser headers and footers turned off.
            </p>
            <div className="label-sheet-preview">
              {labelPages(labels, labelLayouts[layout].perPage).map((sheet, index) => (
                <section
                  className="label-sheet"
                  aria-label={`Label sheet ${index + 1}`}
                  key={index}
                >
                  {/* One printable sheet. */}
                  {sheet.map((item) => (
                    <article className="sheet-label" key={item.id}>
                      {/* One item's QR label. */}
                      {/* Loaded at once, so every code is there when the sheet prints. */}
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
                            ? "Scan to borrow or report an issue"
                            : "Scan to view or report an issue"}
                        </p>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </>
        ) : !invalid && !tooMany ? (
          <div className="no-print">
            <EmptyState
              icon={QrCode}
              title={
                location || category || ids.length
                  ? "No items found for this selection."
                  : "Choose what to print."
              }
            >
              {location || category || ids.length
                ? "Choose another room or category, or pick items one by one."
                : "Pick a room or a category to print everything in it, or search above to pick items one by one."}
            </EmptyState>
          </div>
        ) : null}
      </div>
    </div>
  );
}
