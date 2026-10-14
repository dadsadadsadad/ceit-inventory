"use server";

import { AuditAction } from "@prisma/client";

import { auditActorName } from "@/lib/audit-event";
import { runTransaction } from "@/lib/database-transaction";
import { isUuid } from "@/lib/ids";
import { prisma } from "@/prisma";
import { getCurrentInventoryUser } from "@/lib/inventory-auth";

const scanDeduplicationWindowMs = 15_000;
// anyone can open a label page, so anonymous scans are only logged every so often
const anonymousScanWindowMs = 5 * 60 * 1000;

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

  try {
    // check + insert together so simultaneous opens log once
    await runTransaction(async (tx) => {
      const recentScan = await tx.inventoryAudit.findFirst({
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
      await tx.inventoryAudit.create({
        data: {
          itemId: item.id,
          action: AuditAction.SCANNED,
          summary: actor ? "Item QR code scanned by staff." : "Item QR code opened.",
          actorId: actor?.id ?? null,
          actorName: auditActorName(actor),
          metadata: { source: "qr", scanType: actor ? "staff" : "public" },
        },
      });
    });
  } catch (error) {
    // logging is optional, don't break the page
    console.error("Unable to record a QR scan", error);
  }
}
