import { auditEventData } from "@/lib/audit-event";
import type { InventoryUser } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

// A logging failure should not block the download.
export async function recordExport(user: InventoryUser, kind: string, format: "CSV" | "PDF") {
  try {
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "EXPORTED",
        actor: user,
        entity: {
          id: `${format.toLowerCase()}:${kind}`,
          label: `${kind} ${format} report`,
          type: "report-export",
        },
        metadata: { activityKind: "report-export", format, kind },
        summary: `${kind} report exported as ${format}.`,
      }),
    });
  } catch (error) {
    console.error(`Unable to record ${format} export`, error);
  }
}
