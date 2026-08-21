"use server";

import { AuditAction, ItemStatus, MaintenancePriority, MaintenanceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string, maximumLength: number, required = false) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maximumLength) throw new Error(`${key} is too long.`);
  if (required && !value) throw new Error(`${key} is required.`);
  return value || null;
}

function id(formData: FormData, key: string) {
  const value = text(formData, key, 64, true);
  if (!value || !uuidPattern.test(value)) throw new Error("Invalid maintenance record.");
  return value;
}

function enumValue<T extends string>(formData: FormData, key: string, values: readonly T[], fallback: T) {
  const value = text(formData, key, 64);
  if (!value) return fallback;
  if (!values.includes(value as T)) throw new Error(`Invalid ${key}.`);
  return value as T;
}

function revalidate(itemId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/maintenance");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/inventory");
  if (itemId) revalidatePath(`/dashboard/inventory/${itemId}`);
}

export async function createMaintenanceTicket(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = id(formData, "itemId");
  const title = text(formData, "title", 255, true);
  const description = text(formData, "description", 5_000, true);
  const priority = enumValue(formData, "priority", Object.values(MaintenancePriority), MaintenancePriority.NORMAL);
  const assignedToName = text(formData, "assignedToName", 255);
  const markDefective = formData.get("markDefective") === "on";

  await prisma.$transaction(async (transaction) => {
    const item = await transaction.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true, status: true } });
    if (!item || item.status === ItemStatus.RETIRED) throw new Error("Choose an active inventory item.");
    await transaction.maintenanceTicket.create({
      data: { inventoryItemId: itemId, title: title ?? "", description: description ?? "", priority, assignedToName, reportedByName: actor.email },
    });
    if (markDefective && item.status !== ItemStatus.DEFECTIVE) {
      await transaction.inventoryItem.update({ where: { id: itemId }, data: { status: ItemStatus.DEFECTIVE } });
    }
    await transaction.inventoryAudit.create({
      data: {
        itemId,
        action: markDefective ? AuditAction.STATUS_CHANGED : AuditAction.UPDATED,
        summary: `Service request reported: ${title}.`,
        actorId: actor.id,
        actorName: actor.email,
        metadata: { priority, markDefective, source: "maintenance" },
      },
    });
  });

  revalidate(itemId);
  redirect("/dashboard/maintenance?created=1");
}

export async function updateMaintenanceTicket(formData: FormData) {
  const actor = await requireWriteAccess();
  const ticketId = id(formData, "ticketId");
  const status = enumValue(formData, "status", Object.values(MaintenanceStatus), MaintenanceStatus.OPEN);
  const assignedToName = text(formData, "assignedToName", 255);
  const resolutionNotes = text(formData, "resolutionNotes", 5_000);

  const ticket = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.maintenanceTicket.findUnique({ where: { id: ticketId }, select: { id: true, inventoryItemId: true, status: true, title: true } });
    if (!existing) throw new Error("This service request no longer exists.");
    const resolvedAt = status === MaintenanceStatus.RESOLVED ? new Date() : null;
    await transaction.maintenanceTicket.update({
      where: { id: ticketId },
      data: { status, assignedToName, resolutionNotes, resolvedAt },
    });
    await transaction.inventoryAudit.create({
      data: {
        itemId: existing.inventoryItemId,
        action: AuditAction.UPDATED,
        summary: `Service request updated: ${existing.title} (${status}).`,
        actorId: actor.id,
        actorName: actor.email,
        metadata: { maintenanceTicketId: existing.id, previousStatus: existing.status, status },
      },
    });
    return existing;
  });

  revalidate(ticket.inventoryItemId);
}
