"use client";

import { useEffect } from "react";

import { recordInventoryScan } from "./actions";

export function ScanAuditLogger({ itemId }: { itemId: string }) {
  useEffect(() => {
    void recordInventoryScan(itemId);
  }, [itemId]);

  return null;
}
