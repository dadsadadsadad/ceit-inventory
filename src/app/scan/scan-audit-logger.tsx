"use client";

import { useEffect } from "react";

import { recordInventoryScan } from "./actions";

export function ScanAuditLogger({ itemId }: { itemId: string }) {
  useEffect(() => {
    void recordInventoryScan(itemId).catch(() => {
      // ignore failures, scanning still works if the session expired
    });
  }, [itemId]);

  return null;
}
