"use server";

import { ItemStatus, PublicRequestKind } from "@prisma/client";
import { redirect } from "next/navigation";
import { auditEventData } from "@/lib/audit-event";
import { FormError, formAction } from "@/lib/form-action";
import { enforcePublicRequestRateLimit } from "@/lib/public-request-protection";
import { isInventoryQrCode } from "@/lib/qr-code";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { runTransaction } from "@/lib/database-transaction";

// Validate the issue and send it to maintenance.
export async function submitIssueReport(formData: FormData) {
  return formAction(async () => {
    const qrCode = String(formData.get("qrCode") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (formData.get("website")) {
      throw new FormError("Unable to send this report. Please try again.");
    }
    if (!isInventoryQrCode(qrCode)) {
      throw new FormError("This QR code is not valid.");
    }
    if (title.length < 3 || title.length > 120) {
      throw new FormError("Use between 3 and 120 characters for the issue title.");
    }
    if (description.length < 10 || description.length > 2_000) {
      throw new FormError("Describe the issue in 10 to 2,000 characters.");
    }
    await enforcePublicRequestRateLimit(PublicRequestKind.ISSUE);
    // Reuse an identical open report.
    const itemId = await runTransaction(async (transaction) => {
      const item = await transaction.inventoryItem.findUnique({
        where: { qrCode },
        select: { id: true, status: true },
      });
      if (!item || item.status === ItemStatus.RETIRED) {
        throw new FormError(
          "This item is no longer accepting issue reports. Please contact CEIT staff.",
        );
      }
      const duplicate = await transaction.maintenanceTicket.findFirst({
        where: {
          inventoryItemId: item.id,
          source: "QR",
          status: "OPEN",
          title: { equals: title, mode: "insensitive" },
          description,
        },
      });
      if (!duplicate) {
        const ticket = await transaction.maintenanceTicket.create({
          data: { inventoryItemId: item.id, title, description, source: "QR" },
        });
        await transaction.inventoryAudit.create({
          data: auditEventData({
            action: "REQUESTED",
            entity: {
              id: ticket.id,
              itemId: item.id,
              label: title,
              type: "maintenance-ticket",
            },
            metadata: { source: "public-qr", priority: "NORMAL" },
            summary: `Issue reported from a QR code: ${title}.`,
          }),
        });
      }
      return item.id;
    });
    refreshInventoryViews(itemId);
    redirect(`/scan/${encodeURIComponent(qrCode)}?issue=sent`);
  });
}
