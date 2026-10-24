import { ItemType } from "@prisma/client";
import { ScanLine } from "lucide-react";
import Link from "next/link";

import { ScanAuditLogger } from "@/app/scan/scan-audit-logger";

import { MarkCheckedButton } from "./mark-checked-button";

// shortcuts shown after staff scan a label
export function ScanStrip({
  item,
  onLoan,
}: {
  item: { id: string; itemType: ItemType; qrCode: string };
  onLoan: boolean;
}) {
  const base = `/scan/${encodeURIComponent(item.qrCode)}?view=public`;
  return (
    <div className="scan-strip card rounded-lg" role="status">
      <ScanAuditLogger itemId={item.id} />
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ScanLine size={18} aria-hidden="true" />
        Scanned
      </p>
      <div className="scan-strip-actions">
        {item.itemType === ItemType.ASSET ? (
          <>
            <Link href={`${base}&mode=borrow`} className="secondary-button rounded-lg">
              Borrow
            </Link>
            {onLoan ? (
              <Link href={`${base}&mode=return`} className="secondary-button rounded-lg">
                Return
              </Link>
            ) : null}
          </>
        ) : null}
        <Link href={`${base}&mode=issue`} className="secondary-button rounded-lg">
          Report a problem
        </Link>
        <MarkCheckedButton itemId={item.id} className="secondary-button w-full rounded-lg" />
        <Link href="/scan" className="secondary-button rounded-lg">
          Scan another
        </Link>
      </div>
    </div>
  );
}
