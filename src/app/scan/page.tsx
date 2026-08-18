import Link from "next/link";

import { requireInventoryAccess } from "@/lib/supabase/server";

import { QrScanner } from "./qr-scanner";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  await requireInventoryAccess();

  return (
    <main className="page">
      <div className="page-narrow space-y-6">
        <header>
          <Link href="/dashboard" className="muted text-sm font-semibold hover:text-orange-400">← Dashboard</Link>
          <p className="eyebrow mt-5">Mobile inventory</p>
          <h1 className="title mt-3 text-3xl">Scan a QR label</h1>
          <p className="muted mt-2 text-sm leading-6">Use your phone camera to open the exact CEIT asset record, then review or update its room, status, stock, and PC details.</p>
        </header>
        <QrScanner />
      </div>
    </main>
  );
}
