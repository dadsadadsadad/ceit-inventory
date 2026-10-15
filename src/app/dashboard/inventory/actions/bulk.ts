"use server";

import { AuditAction, BorrowStatus, ItemCondition, ItemStatus, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { auditActorName, auditEventData } from "@/lib/audit-event";
import { FormError, formAction } from "@/lib/form-action";
import { requireWriteAccess } from "@/lib/inventory-auth";
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

export async function bulkUpdateInventory(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const ids = selectedIds(formData);
    const action = requiredText(formData, "bulkAction", 64);

    if (action === "delete") {
      const confirmation = requiredText(formData, "bulkRemovalConfirmation", 16);
      if (confirmation !== "DELETE") {
        throw new FormError("Type DELETE to confirm.");
      }

      try {
        await prisma.$transaction(
          async (tx) => {
            const [items, borrowingHistoryCount, maintenanceHistoryCount] = await Promise.all([
              tx.inventoryItem.findMany({
                where: { id: { in: ids } },
                select: { assetTag: true, id: true, name: true },
              }),
              tx.borrowRequest.count({ where: { inventoryItemId: { in: ids } } }),
              tx.maintenanceTicket.count({ where: { inventoryItemId: { in: ids } } }),
            ]);
            if (items.length !== ids.length) {
              throw new FormError("Some selected items no longer exist. Refresh and try again.");
            }
            if (borrowingHistoryCount || maintenanceHistoryCount) {
              throw new FormError(
                `Can't delete because the selection has ${borrowingHistoryCount} borrowing and ${maintenanceHistoryCount} maintenance history record${borrowingHistoryCount + maintenanceHistoryCount === 1 ? "" : "s"}. Retire them instead.`,
              );
            }

            await Promise.all(
              items.map((item) =>
                tx.inventoryAudit.updateMany({
                  where: { itemId: item.id },
                  data: {
                    entityId: item.id,
                    entityLabel: item.assetTag ?? item.name,
                    entityType: "inventory-item",
                  },
                }),
              ),
            );
            await tx.inventoryAudit.createMany({
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
                  summary: "Deleted (bulk).",
                }),
              ),
            });
            const deleted = await tx.inventoryItem.deleteMany({
              where: { id: { in: ids } },
            });
            if (deleted.count !== ids.length) {
              throw new FormError("Some selected items changed. Refresh and try again.");
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new FormError("Some selected items now have history. Retire them instead.");
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
      summary = "Moved (bulk).";
    } else if (action === "status") {
      const status = enumValue(formData, "bulkStatus", statuses, ItemStatus.OK);
      if (status === ItemStatus.RETIRED) {
        throw new FormError("Use Retire instead.");
      }
      data = { status };
      summary = `Status changed to ${status}.`;
    } else if (action === "condition") {
      const condition = enumValue(formData, "bulkCondition", conditions, ItemCondition.GOOD);
      data = { condition };
      summary = `Condition changed to ${condition}.`;
    } else if (action === "inspect") {
      inspectedAt = new Date();
      data = { lastCheckedAt: inspectedAt };
      summary = "Checked (bulk).";
    } else if (isRetirement) {
      const confirmation = requiredText(formData, "bulkRemovalConfirmation", 16);
      if (confirmation !== "RETIRE") {
        throw new FormError("Type RETIRE to confirm.");
      }
      data = { status: ItemStatus.RETIRED };
      summary = "Retired (bulk).";
    } else {
      throw new FormError("Pick an action.");
    }

    await prisma.$transaction(
      async (tx) => {
        const selectedCount = await tx.inventoryItem.count({ where: { id: { in: ids } } });
        if (selectedCount !== ids.length) {
          throw new FormError("Some selected items no longer exist. Refresh and try again.");
        }

        if (targetLocationId) {
          const location = await tx.location.findFirst({
            where: { id: targetLocationId, isActive: true },
            select: { name: true },
          });
          if (!location) {
            throw new FormError("Choose an active location.");
          }
          summary = `Moved to ${location.name} (bulk).`;
        }

        if (isRetirement) {
          const activeBorrowingCount = await tx.borrowRequest.count({
            where: { inventoryItemId: { in: ids }, status: { in: activeBorrowRequestStatuses } },
          });
          if (activeBorrowingCount) {
            throw new FormError(
              `Retirement is blocked because ${activeBorrowingCount} active borrowing request${activeBorrowingCount === 1 ? "" : "s"} still use the selection. Close those requests first.`,
            );
          }
        }

        if (data.status === ItemStatus.OK || data.status === ItemStatus.WORKING) {
          const outstanding = await tx.borrowRequest.count({
            where: {
              inventoryItemId: { in: ids },
              status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
            },
          });
          if (outstanding) {
            throw new FormError(
              "Some selected items are still borrowed. Mark them returned first.",
            );
          }
        }

        await tx.inventoryItem.updateMany({ where: { id: { in: ids } }, data });
        if (inspectedAt) {
          // keep the pc profile's inspection date in sync
          await tx.computer.updateMany({
            where: { itemId: { in: ids } },
            data: { lastCheckedAt: inspectedAt },
          });
        }
        await tx.inventoryAudit.createMany({
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
