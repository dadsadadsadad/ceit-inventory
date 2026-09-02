"use server";

import { AuditAction } from "@prisma/client";

import { prisma } from "@/prisma";
import { getCurrentInventoryUser } from "@/lib/inventory-auth";

const scanDeduplicationWindowMs = 15_000;

export async function recordInventoryScan(itemId: string) {
  const actor = await getCurrentInventoryUser();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId)) return;

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) return;

  const recentScan = await prisma.inventoryAudit.findFirst({
    where: {
      itemId: item.id,
      action: AuditAction.SCANNED,
      actorId: actor?.id ?? null,
      createdAt: { gte: new Date(Date.now() - scanDeduplicationWindowMs) },
    },
    select: { id: true },
  });
  if (recentScan) return;

  await prisma.inventoryAudit.create({
    data: {
      itemId: item.id,
      action: AuditAction.SCANNED,
      summary: actor ? "Item QR code scanned by staff." : "Item QR code opened.",
      actorId: actor?.id ?? null,
      actorName: actor?.email ?? null,
      metadata: { source: "qr", scanType: actor ? "staff" : "public" },
    },
  });
}
