"use server";

import { revalidatePath } from "next/cache";

import { auditEventData } from "@/lib/audit-event";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const sharedDashboardNoteScope = "shared-dashboard";
const maximumDashboardNoteLength = 5_000;

function dashboardNoteContent(formData: FormData) {
  const value = formData.get("content");
  if (typeof value !== "string") throw new Error("Enter a valid dashboard note.");

  const content = value.trim();
  if (content.length > maximumDashboardNoteLength) {
    throw new Error(`Dashboard notes must be ${maximumDashboardNoteLength.toLocaleString()} characters or fewer.`);
  }

  return content;
}

export async function saveDashboardNote(formData: FormData) {
  const actor = await requireWriteAccess();
  const content = dashboardNoteContent(formData);

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.dashboardNote.findUnique({ where: { scope: sharedDashboardNoteScope }, select: { id: true } });
    await transaction.dashboardNote.upsert({
      where: { scope: sharedDashboardNoteScope },
      create: { scope: sharedDashboardNoteScope, content, updatedByName: actor.email },
      update: { content, updatedByName: actor.email },
    });
    await transaction.inventoryAudit.create({
      data: auditEventData({
        action: existing ? "UPDATED" : "CREATED",
        actor,
        entity: { id: sharedDashboardNoteScope, label: "Shared dashboard note", type: "dashboard-note" },
        metadata: { activityKind: "dashboard-note", contentLength: content.length },
        summary: existing ? "Shared dashboard note updated." : "Shared dashboard note created.",
      }),
    });
  });

  revalidatePath("/dashboard");
}
