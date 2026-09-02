import Image from "next/image";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { PrintLabel } from "@/app/components/print-label";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryLabelAppUrl } from "@/lib/inventory-label-url";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ItemLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventoryAccess();
  const [{ id }, requestHeaders] = await Promise.all([params, headers()]);
  if (!uuidPattern.test(id)) notFound();

  const item = await prisma.inventoryItem.findUnique({ where: { id }, include: { location: true } });
  if (!item) notFound();

  const appUrl = inventoryLabelAppUrl(process.env.NEXT_PUBLIC_APP_URL, requestHeaders, process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const scanUrl = appUrl ? `${appUrl}/scan/${encodeURIComponent(item.qrCode)}` : null;
  const qrDataUrl = scanUrl ? await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: "M", margin: 1, width: 560 }) : null;

  return (
    <main className="page label-page">
      <div className="page-narrow space-y-6">
        <div className="no-print flex items-center justify-between gap-4"><Link href={`/dashboard/inventory/${item.id}`} className="accent-link text-sm font-semibold">← Back to item</Link>{scanUrl ? <PrintLabel itemId={item.id} /> : null}</div>
        {scanUrl && qrDataUrl ? (
          <article className="print-label mx-auto max-w-md rounded-lg p-7 text-center">
            <p className="eyebrow">CEIT inventory</p>
            <h1 className="mt-3 text-2xl font-bold">{item.name}</h1>
            <p className="mt-2 text-sm text-slate-600">{item.assetTag ?? "No asset tag"} · {item.location.name}</p>
            <Image unoptimized className="mx-auto mt-6 h-64 w-64" src={qrDataUrl} alt={`QR code for ${item.name}`} width={280} height={280} />
            <p className="mt-5 break-all font-mono text-xs text-slate-600">{item.qrCode}</p>
            <p className="mt-2 text-xs text-slate-600">Students can request to borrow this item. Signed-in staff can also open and update its record.</p>
          </article>
        ) : (
          <section className="notice rounded-lg px-5 py-4 text-sm leading-6" role="alert">
            Set <code>NEXT_PUBLIC_APP_URL</code> to the permanent CEIT public or school-LAN address before printing QR codes. On Vercel, expose the permanent production-domain variable as a fallback. This prevents QR codes from opening a preview deployment or Vercel sign-in page.
          </section>
        )}
      </div>
    </main>
  );
}
