"use server";

import { AuditAction } from "@prisma/client";

import { auditActorName } from "@/lib/audit-event";
import { isUuid } from "@/lib/ids";
import { prisma } from "@/prisma";
import { getCurrentInventoryUser } from "@/lib/inventory-auth";

const scanDeduplicationWindowMs = 15_000;
// Anyone holding a label can open its page and trigger this, so an anonymous open is recorded
// only now and then; otherwise it could fill the audit trail.
const anonymousScanWindowMs = 5 * 60 * 1000;

// Add the QR visit to the item's audit history.
export async function recordInventoryScan(itemId: string) {
  const actor = await getCurrentInventoryUser();
  if (!isUuid(itemId)) {
    return;
  }

  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true },
  });
  if (!item) {
    return;
  }

  const recentScan = await prisma.inventoryAudit.findFirst({
    where: {
      itemId: item.id,
      action: AuditAction.SCANNED,
      actorId: actor?.id ?? null,
      createdAt: {
        gte: new Date(Date.now() - (actor ? scanDeduplicationWindowMs : anonymousScanWindowMs)),
      },
    },
    select: { id: true },
  });
  if (recentScan) {
    return;
  }

  await prisma.inventoryAudit.create({
    data: {
      itemId: item.id,
      action: AuditAction.SCANNED,
      summary: actor ? "Item QR code scanned by staff." : "Item QR code opened.",
      actorId: actor?.id ?? null,
      actorName: auditActorName(actor),
      metadata: { source: "qr", scanType: actor ? "staff" : "public" },
    },
  });
}
