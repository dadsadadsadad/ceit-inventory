"use server";

import { ItemStatus, PublicRequestKind } from "@prisma/client";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auditEventData } from "@/lib/audit-event";
import { stripControlCharacters } from "@/lib/clean-text";
import { FormError, formAction } from "@/lib/form-action";
import { assertFormToken } from "@/lib/form-token";
import { enforcePublicRequestRateLimit } from "@/lib/public-request-protection";
import { isInventoryQrCode } from "@/lib/qr-code";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { runTransaction } from "@/lib/database-transaction";
import { notifyProblemReport } from "@/lib/notify-events";

export async function submitIssueReport(formData: FormData) {
  return formAction(async () => {
    const text = (key: string) => stripControlCharacters(String(formData.get(key) ?? "")).trim();
    const qrCode = text("qrCode");
    const reporterName = text("reporterName");
    const title = text("title");
    const description = text("description");
    if (formData.get("website")) {
      throw new FormError("Couldn't send. Try again.");
    }
    if (!isInventoryQrCode(qrCode)) {
      throw new FormError("Invalid QR code.");
    }
    assertFormToken(`issue:${qrCode}`, String(formData.get("formToken") ?? ""));
    if (reporterName.length < 2 || reporterName.length > 120) {
      throw new FormError("Enter your name.");
    }
    if (title.length < 3 || title.length > 120) {
      throw new FormError("Title has to be 3 to 120 characters.");
    }
    if (description.length < 10 || description.length > 2_000) {
      throw new FormError("Description has to be 10 to 2,000 characters.");
    }
    await enforcePublicRequestRateLimit(PublicRequestKind.ISSUE);
    // reuse an identical open report
    let created = false;
    const itemId = await runTransaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: { qrCode },
        select: { id: true, status: true },
      });
      if (!item || item.status === ItemStatus.RETIRED) {
        throw new FormError("This item can't take reports. Ask CEIT staff.");
      }
      const duplicate = await tx.maintenanceTicket.findFirst({
        where: {
          inventoryItemId: item.id,
          source: "QR",
          status: "OPEN",
          title: { equals: title, mode: "insensitive" },
          description,
        },
      });
      if (!duplicate) {
        created = true;
        const ticket = await tx.maintenanceTicket.create({
          data: {
            inventoryItemId: item.id,
            title,
            description,
            source: "QR",
            reportedByName: reporterName,
          },
        });
        await tx.inventoryAudit.create({
          data: auditEventData({
            action: "REQUESTED",
            entity: {
              id: ticket.id,
              itemId: item.id,
              label: title,
              type: "maintenance-ticket",
            },
            metadata: { source: "public-qr", priority: "NORMAL", reportedBy: reporterName },
            summary: `Reported (QR) by ${reporterName}: ${title}.`,
          }),
        });
      }
      return item.id;
    });
    if (created) {
      after(() => notifyProblemReport(qrCode, { description, reporterName, title }));
    }
    refreshInventoryViews(itemId);
    redirect(`/scan/${encodeURIComponent(qrCode)}?issue=sent`);
  });
}
