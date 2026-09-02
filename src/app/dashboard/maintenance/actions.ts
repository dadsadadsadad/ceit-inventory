"use server";

import { AuditAction, ItemStatus, MaintenancePriority, MaintenanceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auditEventData } from "@/lib/audit-event";
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

function enumValue<T extends string>(formData: FormData, key: string, values: readonly T[], fallback: T, required = false) {
  const value = text(formData, key, 64);
  if (!value) {
    if (required) throw new Error(`${key} is required.`);
    return fallback;
  }
  if (!values.includes(value as T)) throw new Error(`Invalid ${key}.`);
  return value as T;
}

function resolutionItemStatus(formData: FormData) {
  const value = text(formData, "itemStatus", 64);
  if (!value) return null;
  if (!Object.values(ItemStatus).includes(value as ItemStatus) || value === ItemStatus.RETIRED) {
    throw new Error("Choose a valid item status after resolving the request.");
  }
  return value as ItemStatus;
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
  const markDefective = formData.get("markDefective") === "on";

  await prisma.$transaction(async (transaction) => {
    const item = await transaction.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true, status: true } });
    if (!item || item.status === ItemStatus.RETIRED) throw new Error("Choose an active inventory item.");
    const ticket = await transaction.maintenanceTicket.create({
      data: { inventoryItemId: itemId, title: title ?? "", description: description ?? "", priority, reportedByName: actor.email },
    });
    const itemWasMarkedDefective = markDefective && item.status !== ItemStatus.DEFECTIVE;
    if (itemWasMarkedDefective) {
      await transaction.inventoryItem.update({ where: { id: itemId }, data: { status: ItemStatus.DEFECTIVE } });
      await transaction.inventoryAudit.create({
        data: auditEventData({
          action: AuditAction.STATUS_CHANGED,
          actor,
          entity: { id: itemId, itemId, label: title, type: "inventory-item" },
          metadata: { source: "maintenance-request", maintenanceTicketId: ticket.id, previousStatus: item.status, status: ItemStatus.DEFECTIVE },
          summary: "Item status changed to defective while a maintenance request was reported.",
        }),
      });
    }
    await transaction.inventoryAudit.create({
      data: auditEventData({
        action: "CREATED",
        actor,
        entity: { id: ticket.id, itemId, label: title, type: "maintenance-ticket" },
        metadata: { markDefective: itemWasMarkedDefective, priority, source: "maintenance" },
        summary: `Maintenance request reported: ${title}.`,
      }),
    });
  });

  revalidate(itemId);
  redirect("/dashboard/maintenance?created=1");
}

export async function updateMaintenanceTicket(formData: FormData) {
  const actor = await requireWriteAccess();
  const ticketId = id(formData, "ticketId");
  const status = enumValue(formData, "status", Object.values(MaintenanceStatus), MaintenanceStatus.OPEN, true);
  const resolutionNotes = text(formData, "resolutionNotes", 5_000);
  const itemStatus = resolutionItemStatus(formData);

  const ticket = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.maintenanceTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        inventoryItemId: true,
        inventoryItem: { select: { assetTag: true, id: true, name: true, status: true } },
        resolutionNotes: true,
        resolvedAt: true,
        status: true,
        title: true,
      },
    });
    if (!existing) throw new Error("This maintenance request no longer exists.");
    if (itemStatus && status !== MaintenanceStatus.RESOLVED) {
      throw new Error("Choose an item status only when resolving the maintenance request.");
    }

    const resolvedAt = status === MaintenanceStatus.RESOLVED
      ? existing.status === MaintenanceStatus.RESOLVED ? existing.resolvedAt ?? new Date() : new Date()
      : null;
    await transaction.maintenanceTicket.update({
      where: { id: ticketId },
      data: { status, resolutionNotes, resolvedAt },
    });
    const itemStatusChanged = Boolean(itemStatus && itemStatus !== existing.inventoryItem.status);
    if (itemStatusChanged && itemStatus) {
      await transaction.inventoryItem.update({ where: { id: existing.inventoryItem.id }, data: { status: itemStatus } });
      await transaction.inventoryAudit.create({
        data: auditEventData({
          action: AuditAction.STATUS_CHANGED,
          actor,
          entity: { id: existing.inventoryItem.id, itemId: existing.inventoryItem.id, label: existing.inventoryItem.assetTag ?? existing.inventoryItem.name, type: "inventory-item" },
          metadata: { source: "maintenance-resolution", maintenanceTicketId: existing.id, previousStatus: existing.inventoryItem.status, status: itemStatus },
          summary: `Item status updated while resolving maintenance request: ${existing.title}.`,
        }),
      });
    }
    await transaction.inventoryAudit.create({
      data: auditEventData({
        action: "UPDATED",
        actor,
        entity: { id: existing.id, itemId: existing.inventoryItemId, label: existing.title, type: "maintenance-ticket" },
        metadata: {
          changes: {
            itemStatus: itemStatusChanged ? { from: existing.inventoryItem.status, to: itemStatus } : undefined,
            resolutionNotesChanged: existing.resolutionNotes !== resolutionNotes,
            status: existing.status === status ? undefined : { from: existing.status, to: status },
          },
          maintenanceTicketId: existing.id,
          source: "maintenance",
        },
        summary: `Maintenance request updated: ${existing.title} (${status}).`,
      }),
    });
    return existing;
  });

  revalidate(ticket.inventoryItemId);
}
