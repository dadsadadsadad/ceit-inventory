"use server";

import {
  AuditAction,
  ItemStatus,
  MaintenancePriority,
  MaintenanceStatus,
  Prisma,
} from "@prisma/client";
import { redirect } from "next/navigation";

import { auditEventData } from "@/lib/audit-event";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";
import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { refreshInventoryViews } from "@/lib/refresh-inventory";

function text(formData: FormData, key: string, maxLength: number, required = false) {
  return required ? requiredText(formData, key, maxLength) : optionalText(formData, key, maxLength);
}

function id(formData: FormData, key: string) {
  return requiredUuid(formData, key, "Invalid maintenance record.");
}

function enumValue<T extends string>(
  formData: FormData,
  key: string,
  values: readonly T[],
  fallback: T,
  required = false,
) {
  const value = text(formData, key, 64);
  if (!value) {
    if (required) {
      throw new FormError(`${key} is required.`);
    }
    return fallback;
  }
  if (!values.includes(value as T)) {
    throw new FormError(`Invalid ${key}.`);
  }
  return value as T;
}

function resolutionItemStatus(formData: FormData) {
  const value = text(formData, "itemStatus", 64);
  if (!value) {
    return null;
  }
  if (
    ![ItemStatus.OK, ItemStatus.WORKING, ItemStatus.NOT_TESTED, ItemStatus.DEFECTIVE].includes(
      value as "OK" | "WORKING" | "NOT_TESTED" | "DEFECTIVE",
    )
  ) {
    throw new FormError("Pick a valid status.");
  }
  return value as ItemStatus;
}

export async function createMaintenanceTicket(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    if (!String(formData.get("itemId") ?? "").trim()) {
      throw new FormError("Pick the item from the list.");
    }
    const itemId = id(formData, "itemId");
    const title = text(formData, "title", 255, true);
    const description = text(formData, "description", 5_000, true);
    const priority = enumValue(
      formData,
      "priority",
      Object.values(MaintenancePriority),
      MaintenancePriority.NORMAL,
    );
    const markDefective = formData.get("markDefective") === "on";

    await prisma.$transaction(
      async (tx) => {
        const item = await tx.inventoryItem.findUnique({
          where: { id: itemId },
          select: { id: true, assetTag: true, name: true, status: true },
        });
        if (!item || item.status === ItemStatus.RETIRED) {
          throw new FormError("Pick an active item.");
        }
        const ticket = await tx.maintenanceTicket.create({
          data: {
            inventoryItemId: itemId,
            title: title ?? "",
            description: description ?? "",
            priority,
            reportedByName: actor.username,
          },
        });
        const itemWasMarkedDefective = markDefective && item.status !== ItemStatus.DEFECTIVE;
        if (itemWasMarkedDefective) {
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: { status: ItemStatus.DEFECTIVE },
          });
          await tx.inventoryAudit.create({
            data: auditEventData({
              action: AuditAction.STATUS_CHANGED,
              actor,
              entity: {
                id: itemId,
                itemId,
                label: item.assetTag ?? item.name,
                type: "inventory-item",
              },
              metadata: {
                source: "maintenance-request",
                maintenanceTicketId: ticket.id,
                previousStatus: item.status,
                status: ItemStatus.DEFECTIVE,
              },
              summary: "Marked defective (maintenance).",
            }),
          });
        }
        await tx.inventoryAudit.create({
          data: auditEventData({
            action: "CREATED",
            actor,
            entity: { id: ticket.id, itemId, label: title, type: "maintenance-ticket" },
            metadata: { markDefective: itemWasMarkedDefective, priority, source: "maintenance" },
            summary: `Issue reported: ${title}.`,
          }),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    refreshInventoryViews(itemId);
    redirect("/dashboard/maintenance?created=1");
  });
}

export async function updateMaintenanceTicket(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const ticketId = id(formData, "ticketId");
    const status = enumValue(
      formData,
      "status",
      Object.values(MaintenanceStatus),
      MaintenanceStatus.OPEN,
      true,
    );
    const resolutionNotes = text(formData, "resolutionNotes", 5_000);
    const itemStatus = resolutionItemStatus(formData);
    const priority = enumValue(
      formData,
      "priority",
      Object.values(MaintenancePriority),
      MaintenancePriority.NORMAL,
      true,
    );

    const ticket = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.maintenanceTicket.findUnique({
          where: { id: ticketId },
          select: {
            id: true,
            inventoryItemId: true,
            inventoryItem: { select: { assetTag: true, id: true, name: true, status: true } },
            resolutionNotes: true,
            resolvedAt: true,
            status: true,
            title: true,
            priority: true,
            updatedAt: true,
          },
        });
        if (!existing) {
          throw new FormError("This request no longer exists.");
        }
        // someone else saved since the form was opened
        const submittedVersion = String(formData.get("updatedAt") ?? "");
        if (submittedVersion && submittedVersion !== existing.updatedAt.toISOString()) {
          throw new FormError("Someone else changed this request. Refresh and try again.");
        }
        if (itemStatus && existing.inventoryItem.status === ItemStatus.RETIRED) {
          throw new FormError("Restore this item first.");
        }
        if (itemStatus === ItemStatus.OK || itemStatus === ItemStatus.WORKING) {
          const outstanding = await tx.borrowRequest.count({
            where: {
              inventoryItemId: existing.inventoryItemId,
              status: { in: ["BORROWED", "RETURN_REQUESTED"] },
            },
          });
          if (outstanding) {
            throw new FormError("Mark it returned first.");
          }
        }

        // keep the first resolved date if it was already resolved
        const resolvedAt =
          status === MaintenanceStatus.RESOLVED
            ? existing.status === MaintenanceStatus.RESOLVED
              ? (existing.resolvedAt ?? new Date())
              : new Date()
            : null;
        await tx.maintenanceTicket.update({
          where: { id: ticketId },
          data: { status, resolutionNotes, resolvedAt, priority },
        });
        const itemStatusChanged = Boolean(
          itemStatus && itemStatus !== existing.inventoryItem.status,
        );
        if (itemStatusChanged && itemStatus) {
          await tx.inventoryItem.update({
            where: { id: existing.inventoryItem.id },
            data: { status: itemStatus },
          });
          await tx.inventoryAudit.create({
            data: auditEventData({
              action: AuditAction.STATUS_CHANGED,
              actor,
              entity: {
                id: existing.inventoryItem.id,
                itemId: existing.inventoryItem.id,
                label: existing.inventoryItem.assetTag ?? existing.inventoryItem.name,
                type: "inventory-item",
              },
              metadata: {
                source: "maintenance-resolution",
                maintenanceTicketId: existing.id,
                previousStatus: existing.inventoryItem.status,
                status: itemStatus,
              },
              summary: `Status changed from maintenance: ${existing.title}.`,
            }),
          });
        }
        await tx.inventoryAudit.create({
          data: auditEventData({
            action: "UPDATED",
            actor,
            entity: {
              id: existing.id,
              itemId: existing.inventoryItemId,
              label: existing.title,
              type: "maintenance-ticket",
            },
            metadata: {
              changes: {
                itemStatus: itemStatusChanged
                  ? { from: existing.inventoryItem.status, to: itemStatus }
                  : undefined,
                resolutionNotesChanged: existing.resolutionNotes !== resolutionNotes,
                priority:
                  existing.priority === priority
                    ? undefined
                    : { from: existing.priority, to: priority },
                status:
                  existing.status === status ? undefined : { from: existing.status, to: status },
              },
              maintenanceTicketId: existing.id,
              source: "maintenance",
            },
            summary: `Issue updated: ${existing.title} (${status}).`,
          }),
        });
        return existing;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    refreshInventoryViews(ticket.inventoryItemId);
  });
}
