import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryLabelAppUrl } from "@/lib/inventory-label-url";
import { labelLayouts, labelPages, maximumLabelCount } from "@/lib/label-sheet";
import { prisma } from "@/prisma";
import { PrintSheet } from "./print-sheet";

export const dynamic = "force-dynamic";
type Search = { ids?: string | string[]; location?: string | string[]; layout?: string | string[] };
const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Group selected QR labels into printable sheets.
export default async function LabelsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireInventoryAccess();
  const search = await searchParams;
  const selection = first(search.ids) ?? "";
  const ids = [...new Set(selection.split(",").filter(Boolean))];
  const location = first(search.location) ?? "";
  const layout = first(search.layout) === "large" ? "large" : "compact";
  const invalid =
    ids.length > maximumLabelCount ||
    ids.some((id) => !uuid.test(id)) ||
    Boolean(location && !uuid.test(location));
  const [locations, items, requestHeaders] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    !invalid && (ids.length || location)
      ? prisma.inventoryItem.findMany({
          where: ids.length
            ? { id: { in: ids } }
            : { locationId: location, status: { not: "RETIRED" } },
          include: { location: { select: { name: true } } },
          orderBy: [{ assetTag: "asc" }, { id: "asc" }],
          take: maximumLabelCount + 1,
        })
      : Promise.resolve([]),
    headers(),
  ]);
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
              width: 320,
            }),
          })),
        )
      : [];
  return (
    <div className={`page label-sheet-page label-layout-${layout}`}>
      <div className="page-inner space-y-6">
        {/* Label-sheet title and print controls. */}
        <header className="no-print flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/dashboard/inventory" className="accent-link text-sm">
              ← Inventory
            </Link>
            <h1 className="title mt-3 text-3xl">QR labels</h1>
            <p className="muted mt-2 text-sm">Print labels for selected items or a whole room.</p>
          </div>
          {labels.length ? <PrintSheet ids={labels.map((item) => item.id)} /> : null}
        </header>
        {/* Choose the room, items, and label size. */}
        <form className="no-print card flex flex-wrap items-end gap-4 rounded-lg p-5">
          {ids.length ? (
            <>
              <input type="hidden" name="ids" value={selection} />
              <p className="py-2 text-sm">
                {ids.length} selected items ·{" "}
                <Link className="accent-link" href="/dashboard/inventory/labels">
                  Choose a room instead
                </Link>
              </p>
            </>
          ) : (
            <label>
              <span className="block text-sm font-semibold">Room</span>
              <select
                name="location"
                required
                defaultValue={location}
                className="field mt-2 rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">Select a room</option>
                {locations.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="block text-sm font-semibold">Label size</span>
            <select
              name="layout"
              defaultValue={layout}
              className="field mt-2 rounded-lg px-3 py-2.5 text-sm"
            >
              {Object.entries(labelLayouts).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">
            Preview labels
          </button>
        </form>
        {invalid || tooMany ? (
          <p className="notice no-print rounded-lg p-4" role="alert">
            Select up to {maximumLabelCount} valid items from Inventory to print a batch.
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
              {labels.length} labels · A4 paper · Print at 100% scale with browser headers and
              footers turned off.
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
                      <Image
                        unoptimized
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
          <p className="notice no-print rounded-lg p-4">
            {location || ids.length
              ? "No items found for this selection."
              : "Choose a room above, or select items in Inventory to get started."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
