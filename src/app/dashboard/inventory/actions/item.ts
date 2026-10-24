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
import { after } from "next/server";

import { auditActorName, auditEventData } from "@/lib/audit-event";
import { auditFieldLabel } from "@/lib/audit-trail";
import { nextInventoryAssetTag } from "@/lib/asset-tag";
import { FormError, formAction } from "@/lib/form-action";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { isSingleTrackedAsset } from "@/lib/inventory-pc";
import { maxLabelCount } from "@/lib/label-sheet";
import { notifyLowStock } from "@/lib/notify-events";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { stockGotWorse } from "@/lib/stock-level";
import { prisma } from "@/prisma";

import {
  activeBorrowRequestStatuses,
  addInlineCustomField,
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
  maxNewUnits,
  optionalDate,
  optionalInteger,
  optionalPurchasePrice,
  optionalText,
  readInlineCustomField,
  readItemCustomFields,
  readLowStockThreshold,
  requiredId,
  requiredText,
  statuses,
  updatedFields,
  withInlineAnswers,
} from "./shared";

// creates one stock record, one asset, or several units each with their own tag and qr
export async function createInventoryItem(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const categoryId = requiredId(formData, "categoryId");
    const locationId = requiredId(formData, "locationId");
    const itemType = enumValue(formData, "itemType", itemTypes, ItemType.ASSET);
    const isEquipment = itemType === ItemType.ASSET;
    // assets are always quantity 1
    const quantity = isEquipment ? 1 : (optionalInteger(formData, "quantity") ?? 0);
    const units = isEquipment
      ? Math.max(1, optionalInteger(formData, "units", maxNewUnits) ?? 1)
      : 1;
    const isComputer = isEquipment && formData.get("isComputer") === "on";
    const status = enumValue(formData, "status", statuses, ItemStatus.OK);
    const condition = enumValue(formData, "condition", conditions, ItemCondition.GOOD);
    const suppliedAssetTag = identifier(formData, "assetTag");
    const serialNumber = identifier(formData, "serialNumber");
    const lastCheckedAt = checkedDate(formData);
    assertTrackedAssetQuantity(itemType, quantity);
    assertAssetTag(suppliedAssetTag, itemType);
    if (isComputer && !isSingleTrackedAsset({ itemType, quantity })) {
      throw new FormError("A PC has to be equipment, not stock.");
    }
    if (units > 1) {
      if (isComputer) {
        throw new FormError("Add PCs one at a time.");
      }
      if (suppliedAssetTag || serialNumber) {
        throw new FormError(
          "A tag or serial number only fits one unit. Add them one at a time or leave both blank.",
        );
      }
    }
    await assertActiveAssignments(categoryId, locationId);
    const baseCustomFields = await readItemCustomFields(formData, { categoryId, itemType });
    const inlineField = readInlineCustomField(formData);
    const baseName = requiredText(formData, "name", 255);

    const created: string[] = [];
    try {
      await prisma.$transaction(
        async (tx) => {
          const customFields = withInlineAnswers(
            baseCustomFields,
            inlineField ? await addInlineCustomField(tx, inlineField, actor) : {},
          );
          for (let unit = 1; unit <= units; unit += 1) {
            const assetTag = isEquipment
              ? (suppliedAssetTag ?? (await nextInventoryAssetTag(tx, { categoryId, locationId })))
              : suppliedAssetTag;
            const item = await tx.inventoryItem.create({
              data: {
                name: units > 1 ? `${baseName} #${unit}`.slice(0, 255) : baseName,
                assetTag,
                categoryId,
                locationId,
                itemType,
                isComputer,
                quantity,
                lowStockThreshold: readLowStockThreshold(formData, itemType),
                status,
                condition,
                description: optionalText(formData, "description", 5_000),
                manufacturer: optionalText(formData, "manufacturer", 255),
                model: optionalText(formData, "model", 255),
                serialNumber,
                purchaseDate: optionalDate(formData, "purchaseDate"),
                purchasePrice: optionalPurchasePrice(formData),
                warrantyEndsAt: optionalDate(formData, "warrantyEndsAt"),
                customFields,
                notes: optionalText(formData, "notes", 5_000),
                lastCheckedAt,
                computer: isComputer
                  ? { create: { ...computerData(formData), lastCheckedAt } }
                  : undefined,
                auditEvents: {
                  create: {
                    action: AuditAction.CREATED,
                    summary: "Item added.",
                    actorId: actor.id,
                    actorName: auditActorName(actor),
                    metadata: {
                      source: "manual",
                      activityKind: "record-create",
                      assetTagGenerated: !suppliedAssetTag,
                      ...(units > 1 ? { unit, units } : {}),
                    },
                  },
                },
              },
              select: { id: true },
            });
            created.push(item.id);
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw inventoryWriteError(error);
    }

    refreshInventoryViews();
    if (created.length > 1) {
      // go straight to labels when several were made
      redirect(`/dashboard/inventory/labels?ids=${created.join(",")}&created=${created.length}`);
    }
    redirect(`/dashboard/inventory/${created[0]}`);
  });
}

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
      throw new FormError("Someone else changed this item. Refresh and try again.");
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
      throw new FormError("A PC has to be equipment, not stock.");
    }
    await assertActiveAssignments(categoryId, locationId, existing);
    const inlineField = readInlineCustomField(formData);

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
      lowStockThreshold: readLowStockThreshold(formData, itemType),
      warrantyEndsAt: optionalDate(formData, "warrantyEndsAt"),
      customFields: await readItemCustomFields(
        formData,
        { categoryId, itemType },
        existing.customFields,
      ),
      notes: optionalText(formData, "notes", 5_000),
      lastCheckedAt: checkedAtFromDate(
        optionalDate(formData, "lastCheckedAt"),
        existing.lastCheckedAt,
      ),
    };
    try {
      await prisma.$transaction(
        async (tx) => {
          const liveItem = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
          if (liveItem.updatedAt.getTime() !== existing.updatedAt.getTime()) {
            throw new FormError("Someone else changed this item. Refresh and try again.");
          }
          const outstanding = await tx.borrowRequest.count({
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
            throw new FormError("This item is still borrowed. Mark it returned first.");
          }
          if (status === ItemStatus.RETIRED && existing.status !== ItemStatus.RETIRED) {
            const activeBorrowingCount = await tx.borrowRequest.count({
              where: { inventoryItemId: id, status: { in: activeBorrowRequestStatuses } },
            });
            if (activeBorrowingCount) {
              throw new FormError(
                `Retirement is blocked because ${activeBorrowingCount} active borrowing request${activeBorrowingCount === 1 ? "" : "s"} still uses this item. Close the request first.`,
              );
            }
          }
          const resolvedData = {
            ...data,
            customFields: withInlineAnswers(
              data.customFields,
              inlineField ? await addInlineCustomField(tx, inlineField, actor) : {},
            ),
            assetTag:
              itemType === ItemType.ASSET && !data.assetTag
                ? await nextInventoryAssetTag(tx, { categoryId, locationId })
                : data.assetTag,
          };
          const changes = updatedFields(existing, resolvedData);
          const action =
            Object.keys(changes).length === 1 && "locationId" in changes
              ? AuditAction.MOVED
              : Object.keys(changes).length === 1 && "status" in changes
                ? AuditAction.STATUS_CHANGED
                : AuditAction.UPDATED;
          await tx.inventoryItem.update({
            where: { id },
            data: {
              ...resolvedData,
              auditEvents: {
                create: {
                  action,
                  summary: Object.keys(changes).length
                    ? `Updated ${Object.keys(changes)
                        .map((key) => auditFieldLabel(key).toLowerCase())
                        .join(", ")}.`
                    : "Saved, nothing changed.",
                  actorId: actor.id,
                  actorName: auditActorName(actor),
                  metadata: { changes, activityKind: "record-edit" },
                },
              },
            },
          });
          if ("lastCheckedAt" in changes) {
            // keep the pc profile's inspection date in sync
            await tx.computer.updateMany({
              where: { itemId: id },
              data: { lastCheckedAt: resolvedData.lastCheckedAt },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw inventoryWriteError(error);
    }

    if (
      stockGotWorse(existing, {
        itemType,
        lowStockThreshold: data.lowStockThreshold,
        quantity,
        status,
      })
    ) {
      after(() => notifyLowStock(id));
    }
    refreshInventoryViews(id);
  });
}

export async function adjustStockQuantity(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    const direction = enumValue(formData, "direction", ["add", "use"] as const, "add");
    const amount = optionalInteger(formData, "amount", 1_000_000);
    if (!amount || amount < 1) {
      throw new FormError("Enter an amount.");
    }
    const note = optionalText(formData, "note", 200);
    let droppedLow = false;

    await prisma.$transaction(
      async (tx) => {
        const item = await tx.inventoryItem.findUnique({
          where: { id },
          select: { itemType: true, lowStockThreshold: true, quantity: true, status: true },
        });
        if (!item || item.itemType !== ItemType.SUPPLY) {
          throw new FormError("Only stock has a quantity.");
        }
        if (item.status === ItemStatus.RETIRED) {
          throw new FormError("This item is retired. Restore it first.");
        }
        // new count after the change
        const next = direction === "add" ? item.quantity + amount : item.quantity - amount;
        if (next < 0) {
          throw new FormError(`Only ${item.quantity} left, so ${amount} cannot be used.`);
        }
        if (next > 1_000_000) {
          throw new FormError("That quantity is too large.");
        }
        droppedLow = stockGotWorse(item, { ...item, quantity: next });
        await tx.inventoryItem.update({
          where: { id },
          data: {
            quantity: next,
            auditEvents: {
              create: {
                action: AuditAction.UPDATED,
                summary: `Stock ${direction === "add" ? "added" : "used"}: ${item.quantity} to ${next}${note ? `. ${note}` : "."}`,
                actorId: actor.id,
                actorName: auditActorName(actor),
                metadata: {
                  activityKind: "stock-adjust",
                  changes: { quantity: next },
                  previousQuantity: item.quantity,
                  ...(note ? { note } : {}),
                },
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (droppedLow) {
      after(() => notifyLowStock(id));
    }
    refreshInventoryViews(id);
  });
}

export async function retireInventoryItem(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    await prisma.$transaction(
      async (tx) => {
        // can't retire something that's borrowed or reserved
        const [item, activeBorrowingCount] = await Promise.all([
          tx.inventoryItem.findUnique({ where: { id }, select: { status: true } }),
          tx.borrowRequest.count({
            where: { inventoryItemId: id, status: { in: activeBorrowRequestStatuses } },
          }),
        ]);
        if (!item) {
          throw new FormError("This item no longer exists.");
        }
        if (activeBorrowingCount) {
          throw new FormError("This item has an open borrowing request. Close it first.");
        }

        if (item.status !== ItemStatus.RETIRED) {
          await tx.inventoryItem.update({
            where: { id },
            data: {
              status: ItemStatus.RETIRED,
              auditEvents: {
                create: {
                  action: AuditAction.STATUS_CHANGED,
                  summary: "Retired.",
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

// split a grouped asset or stock record into separate units
export async function splitGroupedAsset(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "SPLIT") {
      throw new FormError("Type SPLIT to confirm.");
    }

    const original = await prisma.inventoryItem.findUnique({
      where: { id },
      select: { itemType: true, quantity: true, isComputer: true },
    });
    if (!original || original.quantity <= 1) {
      throw new FormError("This is already a single unit.");
    }
    if (original.isComputer) {
      throw new FormError("PCs can't be split. Fix them one by one.");
    }
    const borrowingHistoryCount = await prisma.borrowRequest.count({
      where: { inventoryItemId: id },
    });
    if (borrowingHistoryCount) {
      throw new FormError("This item has borrowing history and can't be split.");
    }

    let unitIds: string[] = [];
    try {
      unitIds = await prisma.$transaction(
        async (tx) => {
          const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
          if (item.quantity <= 1 || item.isComputer) {
            throw new FormError("This item changed. Refresh and try again.");
          }
          // check again inside the transaction in case a request came in
          if (await tx.borrowRequest.count({ where: { inventoryItemId: id } })) {
            throw new FormError("This item has a borrowing request now and can't be split.");
          }
          const unitCount = item.quantity;
          await tx.inventoryItem.update({
            where: { id },
            data: {
              quantity: 1,
              name: `${item.name} (unit 1)`,
              // stock turns into a single asset with its own tag
              itemType: ItemType.ASSET,
              lowStockThreshold: null,
              assetTag:
                item.assetTag ??
                (await nextInventoryAssetTag(tx, {
                  categoryId: item.categoryId,
                  locationId: item.locationId,
                })),
              auditEvents: {
                create: {
                  action: AuditAction.UPDATED,
                  summary: `Split into ${unitCount} units.`,
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
          const created = [id];
          for (let unitNumber = 2; unitNumber <= unitCount; unitNumber += 1) {
            const assetTag = await nextInventoryAssetTag(tx, {
              categoryId: item.categoryId,
              locationId: item.locationId,
            });
            const unit = await tx.inventoryItem.create({
              select: { id: true },
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
                // copy warranty and custom fields to the new units
                warrantyEndsAt: item.warrantyEndsAt,
                customFields: (item.customFields ?? undefined) as Prisma.InputJsonValue | undefined,
                notes: item.notes,
                lastCheckedAt: item.lastCheckedAt,
                auditEvents: {
                  create: {
                    action: AuditAction.CREATED,
                    summary: `Split from grouped record: unit ${unitNumber} of ${unitCount}.`,
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
            created.push(unit.id);
          }
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw inventoryWriteError(error);
    }

    refreshInventoryViews(id);
    // open the labels for the new units
    redirect(
      unitIds.length <= maxLabelCount
        ? `/dashboard/inventory/labels?ids=${unitIds.join(",")}&created=${unitIds.length}`
        : `/dashboard/inventory/${id}`,
    );
  });
}

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
          summary: "Checked.",
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { source: "inspection", checkedAt: checkedAt.toISOString() },
        },
      }),
    ]);

    refreshInventoryViews(id);
  });
}

// only delete items with no borrowing or maintenance history
export async function deleteInventoryItem(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData, "id");
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "DELETE") {
      throw new FormError("Type DELETE to confirm.");
    }

    const [borrowingHistoryCount, maintenanceHistoryCount] = await Promise.all([
      prisma.borrowRequest.count({ where: { inventoryItemId: id } }),
      prisma.maintenanceTicket.count({ where: { inventoryItemId: id } }),
    ]);
    if (borrowingHistoryCount || maintenanceHistoryCount) {
      throw new FormError(
        `This item has ${borrowingHistoryCount} borrowing and ${maintenanceHistoryCount} maintenance history record${borrowingHistoryCount + maintenanceHistoryCount === 1 ? "" : "s"}. Retire it instead.`,
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.findUnique({
          where: { id },
          select: { assetTag: true, id: true, name: true },
        });
        if (!item) {
          throw new FormError("This item no longer exists.");
        }
        const itemLabel = item.assetTag ?? item.name;
        await tx.inventoryAudit.updateMany({
          where: { itemId: item.id },
          data: { entityId: item.id, entityLabel: itemLabel, entityType: "inventory-item" },
        });
        await tx.inventoryAudit.create({
          data: auditEventData({
            action: "DELETED",
            actor,
            entity: { id: item.id, itemId: item.id, label: itemLabel, type: "inventory-item" },
            metadata: { activityKind: "record-delete", assetTag: item.assetTag ?? "" },
            summary: "Deleted.",
          }),
        });
        await tx.inventoryItem.delete({ where: { id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new FormError("This item has history now. Retire it instead.");
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
