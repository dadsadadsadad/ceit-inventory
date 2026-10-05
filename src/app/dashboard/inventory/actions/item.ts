"use server";

import {
  AuditAction,
  BorrowStatus,
  ItemCondition,
  ItemStatus,
  ItemType,
  Prisma,
} from "@prisma/client";
import { redirect } from "next/navigation";

import { auditActorName, auditEventData } from "@/lib/audit-event";
import { nextInventoryAssetTag } from "@/lib/asset-tag";
import { FormError, formAction } from "@/lib/form-action";
import { requireAdministrator, requireWriteAccess } from "@/lib/inventory-auth";
import { isSingleTrackedAsset } from "@/lib/inventory-pc";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { prisma } from "@/prisma";

import {
  activeBorrowRequestStatuses,
  assertActiveAssignments,
  assertAssetTag,
  assertTrackedAssetQuantity,
  checkedAtFromDate,
  checkedDate,
  computerData,
  conditions,
  enumValue,
  identifier,
  inventoryWriteError,
  itemTypes,
  optionalDate,
  optionalInteger,
  optionalPurchasePrice,
  optionalText,
  requiredId,
  requiredText,
  statuses,
  updatedFields,
} from "./shared";

// Create and update inventory.
export async function createInventoryItem(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const categoryId = requiredId(formData, "categoryId");
    const locationId = requiredId(formData, "locationId");
    const itemType = enumValue(formData, "itemType", itemTypes, ItemType.ASSET);
    const quantity = optionalInteger(formData, "quantity") ?? 1;
    const isComputer = formData.get("isComputer") === "on";
    const status = enumValue(formData, "status", statuses, ItemStatus.OK);
    const condition = enumValue(formData, "condition", conditions, ItemCondition.GOOD);
    const suppliedAssetTag = identifier(formData, "assetTag");
    const lastCheckedAt = checkedDate(formData);
    assertTrackedAssetQuantity(itemType, quantity);
    assertAssetTag(suppliedAssetTag, itemType);
    if (isComputer && !isSingleTrackedAsset({ itemType, quantity })) {
      throw new FormError("A PC must be a single tracked asset, not a supply record.");
    }
    await assertActiveAssignments(categoryId, locationId);

    let item;
    try {
      item = await prisma.$transaction(
        async (transaction) => {
          const assetTag =
            itemType === ItemType.ASSET
              ? (suppliedAssetTag ??
                (await nextInventoryAssetTag(transaction, { categoryId, locationId, status })))
              : suppliedAssetTag;
          return transaction.inventoryItem.create({
            data: {
              name: requiredText(formData, "name", 255),
              assetTag,
              categoryId,
              locationId,
              itemType,
              isComputer,
              quantity,
              status,
              condition,
              description: optionalText(formData, "description", 5_000),
              manufacturer: optionalText(formData, "manufacturer", 255),
              model: optionalText(formData, "model", 255),
              serialNumber: identifier(formData, "serialNumber"),
              purchaseDate: optionalDate(formData, "purchaseDate"),
              purchasePrice: optionalPurchasePrice(formData),
              notes: optionalText(formData, "notes", 5_000),
              lastCheckedAt,
              computer: isComputer
                ? { create: { ...computerData(formData), lastCheckedAt } }
                : undefined,
              auditEvents: {
                create: {
                  action: AuditAction.CREATED,
                  summary: "Inventory item created.",
                  actorId: actor.id,
                  actorName: auditActorName(actor),
                  metadata: {
                    source: "manual",
                    activityKind: "record-create",
                    assetTagGenerated: !suppliedAssetTag,
                  },
                },
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw inventoryWriteError(error);
    }

    refreshInventoryViews();
    redirect(`/dashboard/inventory/${item.id}`);
  });
}

// Save edits and reject a record changed by another user.
export async function updateInventoryItem(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    const existing = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id },
      include: { computer: true },
    });
    const submittedVersion = String(formData.get("updatedAt") ?? "");
    if (submittedVersion && submittedVersion !== existing.updatedAt.toISOString()) {
      throw new FormError(
        "This item changed since you opened it. Refresh the page before saving your edits.",
      );
    }
    const categoryId = requiredId(formData, "categoryId");
    const locationId = requiredId(formData, "locationId");
    const itemType = enumValue(formData, "itemType", itemTypes, existing.itemType);
    const quantity = optionalInteger(formData, "quantity") ?? existing.quantity;
    const isComputer = existing.computer ? true : formData.get("isComputer") === "on";
    const status = enumValue(formData, "status", statuses, existing.status);
    const suppliedAssetTag = identifier(formData, "assetTag");
    const existingAssetTag = itemType === ItemType.ASSET ? existing.assetTag : null;
    assertTrackedAssetQuantity(itemType, quantity, existing);
    assertAssetTag(suppliedAssetTag, itemType);
    if (isComputer && !isSingleTrackedAsset({ itemType, quantity })) {
      throw new FormError("A PC must be a single tracked asset, not a supply record.");
    }
    await assertActiveAssignments(categoryId, locationId, existing);

    const data = {
      name: requiredText(formData, "name", 255),
      assetTag: suppliedAssetTag ?? existingAssetTag,
      categoryId,
      locationId,
      itemType,
      isComputer,
      status,
      condition: enumValue(formData, "condition", conditions, existing.condition),
      quantity,
      description: optionalText(formData, "description", 5_000),
      manufacturer: optionalText(formData, "manufacturer", 255),
      model: optionalText(formData, "model", 255),
      serialNumber: identifier(formData, "serialNumber"),
      purchaseDate: optionalDate(formData, "purchaseDate"),
      purchasePrice: optionalPurchasePrice(formData),
      notes: optionalText(formData, "notes", 5_000),
      lastCheckedAt: checkedAtFromDate(
        optionalDate(formData, "lastCheckedAt"),
        existing.lastCheckedAt,
      ),
    };
    try {
      await prisma.$transaction(
        async (transaction) => {
          const liveItem = await transaction.inventoryItem.findUniqueOrThrow({ where: { id } });
          if (liveItem.updatedAt.getTime() !== existing.updatedAt.getTime()) {
            throw new FormError(
              "This item changed while you were editing it. Refresh the page before saving again.",
            );
          }
          const outstanding = await transaction.borrowRequest.count({
            where: {
              inventoryItemId: id,
              status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] },
            },
          });
          if (
            outstanding &&
            (itemType !== existing.itemType ||
              quantity !== existing.quantity ||
              ((status === ItemStatus.OK || status === ItemStatus.WORKING) &&
                status !== existing.status))
          ) {
            throw new FormError(
              "This equipment is still borrowed. Confirm its return before changing its quantity, type, or availability.",
            );
          }
          if (status === ItemStatus.RETIRED && existing.status !== ItemStatus.RETIRED) {
            const activeBorrowingCount = await transaction.borrowRequest.count({
              where: { inventoryItemId: id, status: { in: activeBorrowRequestStatuses } },
            });
            if (activeBorrowingCount) {
              throw new FormError(
                `Retirement is blocked because ${activeBorrowingCount} active borrowing request${activeBorrowingCount === 1 ? "" : "s"} still references this item. Resolve the request first.`,
              );
            }
          }
          const resolvedData = {
            ...data,
            assetTag:
              itemType === ItemType.ASSET && !data.assetTag
                ? await nextInventoryAssetTag(transaction, { categoryId, locationId, status })
                : data.assetTag,
          };
          const changes = updatedFields(existing, resolvedData);
          const action =
            Object.keys(changes).length === 1 && "locationId" in changes
              ? AuditAction.MOVED
              : Object.keys(changes).length === 1 && "status" in changes
                ? AuditAction.STATUS_CHANGED
                : AuditAction.UPDATED;
          await transaction.inventoryItem.update({
            where: { id },
            data: {
              ...resolvedData,
              auditEvents: {
                create: {
                  action,
                  summary: Object.keys(changes).length
                    ? `Updated ${Object.keys(changes).join(", ")}.`
                    : "Inventory record saved with no field changes.",
                  actorId: actor.id,
                  actorName: auditActorName(actor),
                  metadata: { changes, activityKind: "record-edit" },
                },
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw inventoryWriteError(error);
    }

    refreshInventoryViews(id);
  });
}

// Retire the item while keeping its history.
export async function retireInventoryItem(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    await prisma.$transaction(
      async (transaction) => {
        const [item, activeBorrowingCount] = await Promise.all([
          transaction.inventoryItem.findUnique({ where: { id }, select: { status: true } }),
          transaction.borrowRequest.count({
            where: { inventoryItemId: id, status: { in: activeBorrowRequestStatuses } },
          }),
        ]);
        if (!item) {
          throw new FormError("This item no longer exists.");
        }
        if (activeBorrowingCount) {
          throw new FormError(
            "This item has an active borrowing request. Resolve that request before retiring the record.",
          );
        }

        if (item.status !== ItemStatus.RETIRED) {
          await transaction.inventoryItem.update({
            where: { id },
            data: {
              status: ItemStatus.RETIRED,
              auditEvents: {
                create: {
                  action: AuditAction.STATUS_CHANGED,
                  summary: "Inventory item removed from active inventory.",
                  actorId: actor.id,
                  actorName: auditActorName(actor),
                  metadata: { previousStatus: item.status, status: ItemStatus.RETIRED },
                },
              },
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    refreshInventoryViews(id);
    redirect(`/dashboard/inventory/${id}`);
  });
}

// Give each unit its own record.
export async function splitGroupedAsset(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "SPLIT") {
      throw new FormError("Type SPLIT to create one record per physical unit.");
    }

    const original = await prisma.inventoryItem.findUnique({
      where: { id },
      select: { itemType: true, quantity: true, isComputer: true },
    });
    if (!original || original.itemType !== ItemType.ASSET || original.quantity <= 1) {
      throw new FormError("This record is already an individual asset.");
    }
    if (original.isComputer) {
      throw new FormError(
        "PC and Mac records must be corrected individually so their names, hardware profiles, and network identifiers remain accurate.",
      );
    }
    const borrowingHistoryCount = await prisma.borrowRequest.count({
      where: { inventoryItemId: id },
    });
    if (borrowingHistoryCount) {
      throw new FormError(
        "This grouped asset has borrowing history and cannot be split automatically. Preserve its history, then create individual replacement records for the physical units.",
      );
    }

    try {
      await prisma.$transaction(
        async (transaction) => {
          const item = await transaction.inventoryItem.findUniqueOrThrow({ where: { id } });
          if (item.itemType !== ItemType.ASSET || item.quantity <= 1 || item.isComputer) {
            throw new FormError(
              "This record changed and can no longer be split. Refresh the page and try again.",
            );
          }
          const unitCount = item.quantity;
          await transaction.inventoryItem.update({
            where: { id },
            data: {
              quantity: 1,
              auditEvents: {
                create: {
                  action: AuditAction.UPDATED,
                  summary: `Grouped asset split into ${unitCount} individually tracked units.`,
                  actorId: actor.id,
                  actorName: auditActorName(actor),
                  metadata: {
                    source: "grouped-asset-split",
                    originalQuantity: unitCount,
                    activityKind: "record-edit",
                  },
                },
              },
            },
          });
          for (let unitNumber = 2; unitNumber <= unitCount; unitNumber += 1) {
            const assetTag = await nextInventoryAssetTag(transaction, {
              categoryId: item.categoryId,
              locationId: item.locationId,
              status: item.status,
            });
            await transaction.inventoryItem.create({
              data: {
                name: `${item.name} (unit ${unitNumber})`,
                assetTag,
                categoryId: item.categoryId,
                locationId: item.locationId,
                itemType: ItemType.ASSET,
                quantity: 1,
                status: item.status,
                condition: item.condition,
                description: item.description,
                manufacturer: item.manufacturer,
                model: item.model,
                purchaseDate: item.purchaseDate,
                purchasePrice: item.purchasePrice,
                notes: item.notes,
                lastCheckedAt: item.lastCheckedAt,
                auditEvents: {
                  create: {
                    action: AuditAction.CREATED,
                    summary: `Individual asset created from grouped record: unit ${unitNumber} of ${unitCount}.`,
                    actorId: actor.id,
                    actorName: auditActorName(actor),
                    metadata: {
                      source: "grouped-asset-split",
                      sourceItemId: item.id,
                      unitNumber,
                      unitCount,
                      activityKind: "record-create",
                    },
                  },
                },
              },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw inventoryWriteError(error);
    }

    refreshInventoryViews(id);
    redirect(`/dashboard/inventory/${id}`);
  });
}

// Save the inspection date and responsible staff member.
export async function markInventoryItemChecked(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    const checkedAt = new Date();

    await prisma.$transaction([
      prisma.inventoryItem.update({ where: { id }, data: { lastCheckedAt: checkedAt } }),
      prisma.computer.updateMany({ where: { itemId: id }, data: { lastCheckedAt: checkedAt } }),
      prisma.inventoryAudit.create({
        data: {
          itemId: id,
          action: AuditAction.UPDATED,
          summary: "Item inspection recorded.",
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { source: "inspection", checkedAt: checkedAt.toISOString() },
        },
      }),
    ]);

    refreshInventoryViews(id);
  });
}

// Delete only items without protected borrowing or repair history.
export async function deleteInventoryItem(formData: FormData) {
  return formAction(async () => {
    const actor = await requireAdministrator();
    const id = requiredId(formData, "id");
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "DELETE") {
      throw new FormError("Type DELETE to permanently remove this item.");
    }

    const [borrowingHistoryCount, maintenanceHistoryCount] = await Promise.all([
      prisma.borrowRequest.count({ where: { inventoryItemId: id } }),
      prisma.maintenanceTicket.count({ where: { inventoryItemId: id } }),
    ]);
    if (borrowingHistoryCount || maintenanceHistoryCount) {
      throw new FormError(
        `This item has ${borrowingHistoryCount} borrowing and ${maintenanceHistoryCount} maintenance history record${borrowingHistoryCount + maintenanceHistoryCount === 1 ? "" : "s"}. Remove it from active inventory instead to preserve its history.`,
      );
    }

    try {
      await prisma.$transaction(async (transaction) => {
        const item = await transaction.inventoryItem.findUnique({
          where: { id },
          select: { assetTag: true, id: true, name: true },
        });
        if (!item) {
          throw new FormError("This item no longer exists.");
        }
        const itemLabel = item.assetTag ?? item.name;
        await transaction.inventoryAudit.updateMany({
          where: { itemId: item.id },
          data: { entityId: item.id, entityLabel: itemLabel, entityType: "inventory-item" },
        });
        await transaction.inventoryAudit.create({
          data: auditEventData({
            action: "DELETED",
            actor,
            entity: { id: item.id, itemId: item.id, label: itemLabel, type: "inventory-item" },
            metadata: { activityKind: "record-delete", assetTag: item.assetTag ?? "" },
            summary: "Inventory record permanently deleted.",
          }),
        });
        await transaction.inventoryItem.delete({ where: { id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new FormError(
          "This item now has borrowing or maintenance history. Remove it from active inventory instead to preserve that history.",
        );
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new FormError("This item no longer exists.");
      }
      throw error;
    }
    refreshInventoryViews(id);
    redirect("/dashboard/inventory");
  });
}
