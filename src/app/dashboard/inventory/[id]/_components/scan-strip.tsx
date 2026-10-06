import { ItemType } from "@prisma/client";
import { ScanLine } from "lucide-react";
import Link from "next/link";

import { ScanAuditLogger } from "@/app/scan/scan-audit-logger";

/**
 * Shown after staff scan a label. Editing is the focus of the page, so borrowing, returning and
 * reporting a problem are small shortcuts to the same public forms a borrower would use.
 */
export function ScanStrip({ item }: { item: { id: string; itemType: ItemType; qrCode: string } }) {
  const base = `/scan/${encodeURIComponent(item.qrCode)}?view=public`;
  return (
    <div className="scan-strip card rounded-lg" role="status">
      <ScanAuditLogger itemId={item.id} />
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ScanLine size={18} aria-hidden="true" />
        Scanned from its QR code
      </p>
      <div className="scan-strip-actions">
        {item.itemType === ItemType.ASSET ? (
          <>
            <Link href={`${base}&mode=borrow`} className="secondary-button rounded-lg">
              Borrow
            </Link>
            <Link href={`${base}&mode=return`} className="secondary-button rounded-lg">
              Return
            </Link>
          </>
        ) : null}
        <Link href={`${base}&mode=issue`} className="secondary-button rounded-lg">
          Report a problem
        </Link>
        <Link href="/scan" className="secondary-button rounded-lg">
          Scan another
        </Link>
      </div>
    </div>
  );
}
