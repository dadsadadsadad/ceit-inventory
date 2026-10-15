export const metadata = { title: "Item QR label · CEIT Inventory" };

import Image from "next/image";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { FilterForm } from "@/app/components/filter-form";
import { PrintLabel } from "@/app/components/print-label";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryLabelAppUrl } from "@/lib/inventory-label-url";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

// medium is the original size
const labelSizes = {
  small: "Small: 4 cm code",
  medium: "Medium: 7 cm code",
  large: "Large: 10 cm code",
  poster: "Extra large: 14 cm code",
} as const;
type LabelSize = keyof typeof labelSizes;

export default async function ItemLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ size?: string | string[] }>;
}) {
  await requireInventoryAccess();
  const [{ id }, search, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const requestedSize = firstParam(search.size) ?? "";
  const size: LabelSize = Object.hasOwn(labelSizes, requestedSize)
    ? (requestedSize as LabelSize)
    : "medium";
  if (!isUuid(id)) {
    notFound();
  }

  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { location: true },
  });
  if (!item) {
    notFound();
  }

  const appUrl = inventoryLabelAppUrl(
    process.env.NEXT_PUBLIC_APP_URL,
    requestHeaders,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );
  const scanUrl = appUrl ? `${appUrl}/scan/${encodeURIComponent(item.qrCode)}` : null;
  const qrDataUrl = scanUrl
    ? await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: "M", margin: 1, width: 900 })
    : null;

  return (
    <main className="page label-page">
      <div className="page-narrow space-y-6">
        <div className="no-print flex items-center justify-between gap-4">
          <Link
            href={`/dashboard/inventory/${item.id}`}
            className="accent-link text-sm font-semibold"
          >
            ← Item record
          </Link>
          {scanUrl ? <PrintLabel itemId={item.id} /> : null}
        </div>
        {scanUrl ? (
          <FilterForm
            label="Label size filters"
            className="no-print card flex flex-wrap items-end justify-between gap-4 rounded-lg p-5"
          >
            <label className="min-w-56">
              <span className="block text-sm font-semibold">Label size</span>
              <select
                name="size"
                defaultValue={size === "medium" ? "" : size}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {Object.entries(labelSizes).map(([key, name]) => (
                  <option key={key} value={key === "medium" ? "" : key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href={`/dashboard/inventory/labels?ids=${item.id}`}
              className="accent-link pb-2.5 text-sm font-semibold"
            >
              Print several on one sheet
            </Link>
          </FilterForm>
        ) : null}
        {scanUrl && qrDataUrl ? (
          <article className={`print-label print-label-${size} mx-auto rounded-lg p-7 text-center`}>
            <p className="eyebrow">CEIT inventory</p>
            <h1 className="mt-3 text-2xl font-bold">{item.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {item.assetTag ?? "No asset tag"} · {item.location.name}
            </p>
            <Image
              unoptimized
              loading="eager"
              className="print-label-code mx-auto mt-6"
              src={qrDataUrl}
              alt={`QR code for ${item.name}`}
              width={280}
              height={280}
            />
            <p className="mt-5 break-all font-mono text-xs text-slate-600">{item.qrCode}</p>
            <p className="mt-2 text-xs text-slate-600">Scan to borrow or report a problem.</p>
          </article>
        ) : (
          <section className="notice rounded-lg px-5 py-4 text-sm leading-6" role="alert">
            The site URL isn&apos;t set yet, so labels can&apos;t be printed. Ask an admin to set
            NEXT_PUBLIC_APP_URL.
          </section>
        )}
      </div>
    </main>
  );
}
