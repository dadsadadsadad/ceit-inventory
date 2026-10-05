"use server";

import { AuditAction, BorrowStatus, ItemCondition, ItemStatus, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { auditActorName, auditEventData } from "@/lib/audit-event";
import { FormError, formAction } from "@/lib/form-action";
import { canManageAdministration, requireWriteAccess } from "@/lib/inventory-auth";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { prisma } from "@/prisma";

import {
  activeBorrowRequestStatuses,
  conditions,
  enumValue,
  requiredId,
  requiredText,
  selectedIds,
  statuses,
} from "./shared";

// Changes to selected items.
export async function bulkUpdateInventory(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const ids = selectedIds(formData);
    const action = requiredText(formData, "bulkAction", 64);

    if (action === "delete") {
      if (!canManageAdministration(actor.role)) {
        throw new FormError("Only administrators can permanently delete inventory records.");
      }
      const confirmation = requiredText(formData, "bulkRemovalConfirmation", 16);
      if (confirmation !== "DELETE") {
        throw new FormError("Type DELETE to permanently remove the selected records.");
      }

      try {
        await prisma.$transaction(
          async (transaction) => {
            const [items, borrowingHistoryCount, maintenanceHistoryCount] = await Promise.all([
              transaction.inventoryItem.findMany({
                where: { id: { in: ids } },
                select: { assetTag: true, id: true, name: true },
              }),
              transaction.borrowRequest.count({ where: { inventoryItemId: { in: ids } } }),
              transaction.maintenanceTicket.count({ where: { inventoryItemId: { in: ids } } }),
            ]);
            if (items.length !== ids.length) {
              throw new FormError(
                "One or more selected records no longer exist. Refresh the inventory list and try again.",
              );
            }
            if (borrowingHistoryCount || maintenanceHistoryCount) {
              throw new FormError(
                `Permanent deletion is blocked because the selection has ${borrowingHistoryCount} borrowing and ${maintenanceHistoryCount} maintenance history record${borrowingHistoryCount + maintenanceHistoryCount === 1 ? "" : "s"}. Retire those items instead to preserve their history.`,
              );
            }

            await Promise.all(
              items.map((item) =>
                transaction.inventoryAudit.updateMany({
                  where: { itemId: item.id },
                  data: {
                    entityId: item.id,
                    entityLabel: item.assetTag ?? item.name,
                    entityType: "inventory-item",
                  },
                }),
              ),
            );
            await transaction.inventoryAudit.createMany({
              data: items.map((item) =>
                auditEventData({
                  action: "DELETED",
                  actor,
                  entity: {
                    id: item.id,
                    itemId: item.id,
                    label: item.assetTag ?? item.name,
                    type: "inventory-item",
                  },
                  metadata: { activityKind: "record-delete", bulkAction: "delete" },
                  summary: "Inventory record permanently deleted through a bulk action.",
                }),
              ),
            });
            const deleted = await transaction.inventoryItem.deleteMany({
              where: { id: { in: ids } },
            });
            if (deleted.count !== ids.length) {
              throw new FormError(
                "One or more selected records changed before deletion. Refresh the inventory list and try again.",
              );
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new FormError(
            "One or more selected records gained borrowing or maintenance history. Retire those items instead to preserve that history.",
          );
        }
        throw error;
      }

      refreshInventoryViews();
      redirect("/dashboard/inventory?bulk=deleted");
    }

    let data: Prisma.InventoryItemUncheckedUpdateManyInput;
    let summary: string;
    let targetLocationId: string | null = null;
    let inspectedAt: Date | null = null;
    const isRetirement = action === "remove" || action === "retire";

    if (action === "location") {
      const locationId = requiredId(formData, "bulkLocationId");
      targetLocationId = locationId;
      data = { locationId };
      summary = "Bulk update: moved to a selected location.";
    } else if (action === "status") {
      const status = enumValue(formData, "bulkStatus", statuses, ItemStatus.OK);
      if (status === ItemStatus.RETIRED) {
        throw new FormError("Use the Retire bulk action to remove records from active inventory.");
      }
      data = { status };
      summary = `Bulk update: status changed to ${status}.`;
    } else if (action === "condition") {
      const condition = enumValue(formData, "bulkCondition", conditions, ItemCondition.GOOD);
      data = { condition };
      summary = `Bulk update: condition changed to ${condition}.`;
    } else if (action === "inspect") {
      inspectedAt = new Date();
      data = { lastCheckedAt: inspectedAt };
      summary = "Bulk update: inspection recorded.";
    } else if (isRetirement) {
      const confirmation = requiredText(formData, "bulkRemovalConfirmation", 16);
      if (confirmation !== "RETIRE") {
        throw new FormError("Type RETIRE to remove selected records from active inventory.");
      }
      data = { status: ItemStatus.RETIRED };
      summary = "Bulk update: inventory items removed from active inventory.";
    } else {
      throw new FormError("Choose a valid bulk action.");
    }

    await prisma.$transaction(
      async (transaction) => {
        const selectedCount = await transaction.inventoryItem.count({ where: { id: { in: ids } } });
        if (selectedCount !== ids.length) {
          throw new FormError(
            "One or more selected records no longer exist. Refresh the inventory list and try again.",
          );
        }

        if (targetLocationId) {
          const location = await transaction.location.findFirst({
            where: { id: targetLocationId, isActive: true },
            select: { name: true },
          });
          if (!location) {
            throw new FormError("Choose an active location.");
          }
          summary = `Bulk update: moved to ${location.name}.`;
        }

        if (isRetirement) {
          const activeBorrowingCount = await transaction.borrowRequest.count({
            where: { inventoryItemId: { in: ids }, status: { in: activeBorrowRequestStatuses } },
          });
          if (activeBorrowingCount) {
            throw new FormError(
              `Retirement is blocked because ${activeBorrowingCount} active borrowing request${activeBorrowingCount === 1 ? "" : "s"} still reference the selection. Resolve those requests first.`,
            );
          }
        }

        if (data.status === ItemStatus.OK || data.status === ItemStatus.WORKING) {
          const outstanding = await transaction.borrowRequest.count({
            where: {
              inventoryItemId: { in: ids },
              status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
            },
          });
          if (outstanding) {
            throw new FormError(
              "Some selected equipment is still borrowed. Confirm its return before making it available again.",
            );
          }
        }

        await transaction.inventoryItem.updateMany({ where: { id: { in: ids } }, data });
        if (inspectedAt) {
          // Keep the PC profile's own inspection date in step with the record.
          await transaction.computer.updateMany({
            where: { itemId: { in: ids } },
            data: { lastCheckedAt: inspectedAt },
          });
        }
        await transaction.inventoryAudit.createMany({
          data: ids.map((itemId) => ({
            itemId,
            action:
              action === "location"
                ? AuditAction.MOVED
                : action === "status" || isRetirement
                  ? AuditAction.STATUS_CHANGED
                  : AuditAction.UPDATED,
            summary,
            actorId: actor.id,
            actorName: auditActorName(actor),
            metadata: { bulkAction: action, itemCount: ids.length },
          })),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    refreshInventoryViews();
    redirect("/dashboard/inventory?bulk=updated");
  });
}
