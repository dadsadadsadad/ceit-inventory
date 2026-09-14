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
import { refreshInventoryViews } from "@/lib/refresh-inventory";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string, maximumLength: number, required = false) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maximumLength) {
    throw new FormError(`${key} is too long.`);
  }
  if (required && !value) {
    throw new FormError(`${key} is required.`);
  }
  return value || null;
}

function id(formData: FormData, key: string) {
  const value = text(formData, key, 64, true);
  if (!value || !uuidPattern.test(value)) {
    throw new FormError("Invalid maintenance record.");
  }
  return value;
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

// Check the equipment status selected after inspection.
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
    throw new FormError("Choose a valid item status after resolving the request.");
  }
  return value as ItemStatus;
}

// New maintenance requests.
export async function createMaintenanceTicket(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
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
      async (transaction) => {
        const item = await transaction.inventoryItem.findUnique({
          where: { id: itemId },
          select: { id: true, status: true },
        });
        if (!item || item.status === ItemStatus.RETIRED) {
          throw new FormError("Choose an active inventory item.");
        }
        const ticket = await transaction.maintenanceTicket.create({
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
          await transaction.inventoryItem.update({
            where: { id: itemId },
            data: { status: ItemStatus.DEFECTIVE },
          });
          await transaction.inventoryAudit.create({
            data: auditEventData({
              action: AuditAction.STATUS_CHANGED,
              actor,
              entity: { id: itemId, itemId, label: title, type: "inventory-item" },
              metadata: {
                source: "maintenance-request",
                maintenanceTicketId: ticket.id,
                previousStatus: item.status,
                status: ItemStatus.DEFECTIVE,
              },
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    refreshInventoryViews(itemId);
    redirect("/dashboard/maintenance?created=1");
  });
}

// Inspection results and repair notes.
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
      async (transaction) => {
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
            priority: true,
            updatedAt: true,
          },
        });
        if (!existing) {
          throw new FormError("This maintenance request no longer exists.");
        }
        const submittedVersion = String(formData.get("updatedAt") ?? "");
        if (submittedVersion && submittedVersion !== existing.updatedAt.toISOString()) {
          throw new FormError(
            "This maintenance request changed since you opened it. Refresh the page before saving again.",
          );
        }
        if (itemStatus && existing.inventoryItem.status === ItemStatus.RETIRED) {
          throw new FormError("Restore this item from Inventory before changing its status.");
        }
        if (itemStatus === ItemStatus.OK || itemStatus === ItemStatus.WORKING) {
          const outstanding = await transaction.borrowRequest.count({
            where: {
              inventoryItemId: existing.inventoryItemId,
              status: { in: ["BORROWED", "RETURN_REQUESTED"] },
            },
          });
          if (outstanding) {
            throw new FormError("Confirm the equipment’s return before making it available again.");
          }
        }

        const resolvedAt =
          status === MaintenanceStatus.RESOLVED
            ? existing.status === MaintenanceStatus.RESOLVED
              ? (existing.resolvedAt ?? new Date())
              : new Date()
            : null;
        await transaction.maintenanceTicket.update({
          where: { id: ticketId },
          data: { status, resolutionNotes, resolvedAt, priority },
        });
        const itemStatusChanged = Boolean(
          itemStatus && itemStatus !== existing.inventoryItem.status,
        );
        if (itemStatusChanged && itemStatus) {
          await transaction.inventoryItem.update({
            where: { id: existing.inventoryItem.id },
            data: { status: itemStatus },
          });
          await transaction.inventoryAudit.create({
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
              summary: `Item status updated while resolving maintenance request: ${existing.title}.`,
            }),
          });
        }
        await transaction.inventoryAudit.create({
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
            summary: `Maintenance request updated: ${existing.title} (${status}).`,
          }),
        });
        return existing;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    refreshInventoryViews(ticket.inventoryItemId);
  });
}
