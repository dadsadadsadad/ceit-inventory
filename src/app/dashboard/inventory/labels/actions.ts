"use server";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { auditEventData } from "@/lib/audit-event";
import { maximumLabelCount } from "@/lib/label-sheet";
import { prisma } from "@/prisma";

export async function recordLabelSheetPrinted(ids: string[]) {
  const actor = await requireInventoryAccess();
  if (!Array.isArray(ids) || !ids.length || ids.length > maximumLabelCount || ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Invalid label selection.");
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, assetTag: true, name: true } });
  await prisma.inventoryAudit.createMany({
    data: items.map((item) => auditEventData({
      actor,
      action: "EXPORTED",
      entity: { id: item.id, itemId: item.id, label: item.assetTag ?? item.name, type: "inventory-item" },
      metadata: { activityKind: "label-print", source: "label-print", format: "batch-labels", count: items.length },
      summary: "QR label sheet opened for printing.",
    })),
  });
}
