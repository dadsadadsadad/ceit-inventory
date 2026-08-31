"use client";

import { useEffect } from "react";

import { recordInventoryScan } from "./actions";

export function ScanAuditLogger({ itemId }: { itemId: string }) {
  useEffect(() => {
    void recordInventoryScan(itemId).catch(() => {
      // Scanning must still work if the session expires before this optional
      // activity entry is recorded.
    });
  }, [itemId]);

  return null;
}
