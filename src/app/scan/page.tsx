import Link from "next/link";
import type { Metadata } from "next";

import { requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryLabelAppOrigin } from "@/lib/inventory-label-url";

import { QrScanner } from "./qr-scanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Scan an item · CEIT Inventory" };

// Open the camera and manual QR lookup.
export default async function ScanPage() {
  await requireInventoryAccess();
  const trustedQrOrigin = inventoryLabelAppOrigin(
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  );

  return (
    <main className="page scan-page">
      <div className="page-narrow space-y-6">
        <header>
          <Link href="/dashboard" className="accent-link text-sm font-semibold">
            ← Dashboard
          </Link>
          <p className="eyebrow mt-5">Mobile inventory</p>
          <h1 className="title mt-3 text-3xl">Scan a QR code</h1>
          <p className="muted mt-2 text-sm leading-6">
            Scan an equipment label to open its record for editing. Borrowing, returning, and
            reporting a problem are one tap away.
          </p>
        </header>
        {/* Camera scanner and manual lookup. */}
        <QrScanner trustedQrOrigin={trustedQrOrigin} />
      </div>
    </main>
  );
}
