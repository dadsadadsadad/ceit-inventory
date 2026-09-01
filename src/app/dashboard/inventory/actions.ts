"use server";

import { AuditAction, BorrowStatus, ItemCondition, ItemStatus, ItemType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canManageAdministration, requireAdministrator, requireInventoryAccess, requireWriteAccess } from "@/lib/inventory-auth";
import { isInventoryAssetTag, nextInventoryAssetTag } from "@/lib/asset-tag";
import { canHaveComputerDetails, isSingleTrackedAsset } from "@/lib/inventory-pc";
import { prisma } from "@/prisma";

const statuses = Object.values(ItemStatus);
const conditions = Object.values(ItemCondition);
const itemTypes = Object.values(ItemType);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumBulkSelection = 10_000;
const activeBorrowRequestStatuses = [BorrowStatus.REQUESTED, BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED];

export async function recordInventoryLabelPrinted(itemId: string) {
  const actor = await requireInventoryAccess();
  if (!uuidPattern.test(itemId)) return;

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) return;

  await prisma.inventoryAudit.create({
    data: {
      itemId: item.id,
      action: AuditAction.UPDATED,
      summary: "QR label printed.",
      actorId: actor.id,
      actorName: actor.email,
      metadata: { activityKind: "label-print", source: "qr-label" },
    },
  });
}

function fieldLabel(key: string) {
  return key.replace(/Id$/, "").replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function optionalText(formData: FormData, key: string, maximumLength = 2_000) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maximumLength) throw new Error(`${fieldLabel(key)} is too long.`);
  return value || null;
}

function requiredText(formData: FormData, key: string, maximumLength = 2_000) {
  const value = optionalText(formData, key, maximumLength);
  if (!value) throw new Error(`${fieldLabel(key)} is required.`);
  return value;
}

function requiredId(formData: FormData, key: string) {
  const value = requiredText(formData, key, 64);
  if (!uuidPattern.test(value)) throw new Error(`Invalid ${key}.`);
  return value;
}

function selectedIds(formData: FormData) {
  const ids = [...new Set(formData.getAll("itemIds").map((value) => String(value).trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Select at least one inventory record.");
  if (ids.length > maximumBulkSelection) throw new Error(`Update up to ${maximumBulkSelection.toLocaleString()} inventory records at a time.`);
  if (ids.some((id) => !uuidPattern.test(id))) throw new Error("One or more selected inventory records are invalid.");
  return ids;
}

function identifier(formData: FormData, key: string) {
  return optionalText(formData, key, 255)?.toUpperCase() ?? null;
}

function checkedDate(formData: FormData) {
  return optionalDate(formData, "lastCheckedAt") ?? new Date();
}

function assertTrackedAssetQuantity(itemType: ItemType, quantity: number, existing?: { itemType: ItemType; quantity: number }) {
  if (itemType !== ItemType.ASSET || quantity === 1) return;
  if (existing?.itemType === ItemType.ASSET && existing.quantity === quantity) return;
  throw new Error("Track each physical equipment asset as one record so it can keep its own asset tag, QR label, room, and inspection history. Use a supply record for quantity-based stock.");
}

function assertAssetTag(assetTag: string | null, itemType: ItemType) {
  if (itemType === ItemType.ASSET && assetTag && !isInventoryAssetTag(assetTag)) {
    throw new Error("Asset tags must follow the established INV-CAT-ST-ROOM-0001 format, or leave the field blank to generate the next compatible tag.");
  }
}

function inventoryWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("That asset tag, serial number, or PC MAC address is already assigned to another record.");
  }
  return error;
}

function enumValue<T extends string>(formData: FormData, key: string, values: readonly T[], fallback: T) {
  const value = optionalText(formData, key, 64);
  if (!value) return fallback;
  if (!values.includes(value as T)) throw new Error(`Invalid ${key}.`);
  return value as T;
}

function optionalInteger(formData: FormData, key: string, maximum = 1_000_000) {
  const value = optionalText(formData, key, 32);
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw new Error(`${key} must be a non-negative whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new Error(`${key} is outside the allowed range.`);
  return parsed;
}

function optionalPurchasePrice(formData: FormData, key = "purchasePrice") {
  const value = optionalText(formData, key, 32);
  if (!value) return null;
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Purchase price must be a non-negative Philippine peso amount with up to two decimal places.");
  }
  const [whole, decimal = ""] = value.split(".");
  return new Prisma.Decimal(`${whole}.${decimal.padEnd(2, "0")}`).toString();
}

function optionalDate(formData: FormData, key: string) {
  const value = optionalText(formData, key, 10);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${key} is not a valid date.`);
  return parsed;
}

function computerData(formData: FormData, includeCheckTime = false) {
  return {
    operatingSystem: optionalText(formData, "operatingSystem", 255),
    osVersion: optionalText(formData, "osVersion", 255),
    processor: optionalText(formData, "processor", 255),
    memoryGb: optionalInteger(formData, "memoryGb", 16_384),
    storageGb: optionalInteger(formData, "storageGb", 1_000_000),
    storageType: optionalText(formData, "storageType", 255),
    graphics: optionalText(formData, "graphics", 255),
    macAddress: identifier(formData, "macAddress"),
    ipAddress: optionalText(formData, "ipAddress", 255),
    hardwareDescription: optionalText(formData, "hardwareDescription", 5_000),
    softwareDescription: optionalText(formData, "softwareDescription", 5_000),
    ...(includeCheckTime ? { lastCheckedAt: new Date() } : {}),
  };
}

async function assertActiveAssignments(categoryId: string, locationId: string, current?: { categoryId: string; locationId: string }) {
  const [category, location] = await Promise.all([
    categoryId === current?.categoryId ? Promise.resolve(true) : prisma.category.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } }),
    locationId === current?.locationId ? Promise.resolve(true) : prisma.location.findFirst({ where: { id: locationId, isActive: true }, select: { id: true } }),
  ]);
  if (!category) throw new Error("Choose an active item category.");
  if (!location) throw new Error("Choose an active location.");
}

async function requireComputerForItem(itemId: string, computerId: string) {
  const computer = await prisma.computer.findFirst({ where: { id: computerId, itemId } });
  if (!computer) throw new Error("The PC record does not belong to this inventory item.");
  return computer;
}

function refreshInventoryViews(itemId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/reports");
  if (itemId) revalidatePath(`/dashboard/inventory/${itemId}`);
}

function updatedFields(before: Record<string, unknown>, after: Record<string, unknown>): Prisma.InputJsonObject {
  const entries = Object.entries(after)
    .filter(([key, value]) => String(before[key] ?? "") !== String(value ?? ""))
    .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value === undefined ? null : value as string | number | boolean | null]);
  return Object.fromEntries(entries) as Prisma.InputJsonObject;
}

export async function createInventoryItem(formData: FormData) {
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
  if (isComputer && !isSingleTrackedAsset({ itemType, quantity })) throw new Error("A PC must be a single tracked asset, not a supply record.");
  await assertActiveAssignments(categoryId, locationId);

  let item;
  try {
    item = await prisma.$transaction(async (transaction) => {
      const assetTag = itemType === ItemType.ASSET ? suppliedAssetTag ?? await nextInventoryAssetTag(transaction, { categoryId, locationId, status }) : suppliedAssetTag;
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
          computer: isComputer ? { create: { ...computerData(formData), lastCheckedAt } } : undefined,
          auditEvents: { create: { action: AuditAction.CREATED, summary: "Inventory item created.", actorId: actor.id, actorName: actor.email, metadata: { source: "manual", activityKind: "record-create", assetTagGenerated: !suppliedAssetTag } } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    throw inventoryWriteError(error);
  }

  refreshInventoryViews();
  redirect(`/dashboard/inventory/${item.id}`);
}

export async function updateInventoryItem(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requiredId(formData, "id");
  const existing = await prisma.inventoryItem.findUniqueOrThrow({ where: { id }, include: { computer: true } });
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
  if (isComputer && !isSingleTrackedAsset({ itemType, quantity })) throw new Error("A PC must be a single tracked asset, not a supply record.");
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
    lastCheckedAt: optionalDate(formData, "lastCheckedAt"),
  };
  try {
    await prisma.$transaction(async (transaction) => {
      if (status === ItemStatus.RETIRED && existing.status !== ItemStatus.RETIRED) {
        const activeBorrowingCount = await transaction.borrowRequest.count({
          where: { inventoryItemId: id, status: { in: activeBorrowRequestStatuses } },
        });
        if (activeBorrowingCount) {
          throw new Error(`Retirement is blocked because ${activeBorrowingCount} active borrowing request${activeBorrowingCount === 1 ? "" : "s"} still references this item. Resolve the request first.`);
        }
      }
      const resolvedData = {
        ...data,
        assetTag: itemType === ItemType.ASSET && !data.assetTag ? await nextInventoryAssetTag(transaction, { categoryId, locationId, status }) : data.assetTag,
      };
      const changes = updatedFields(existing, resolvedData);
      const action = Object.keys(changes).length === 1 && "locationId" in changes ? AuditAction.MOVED : Object.keys(changes).length === 1 && "status" in changes ? AuditAction.STATUS_CHANGED : AuditAction.UPDATED;
      await transaction.inventoryItem.update({
        where: { id },
        data: {
          ...resolvedData,
          auditEvents: { create: { action, summary: Object.keys(changes).length ? `Updated ${Object.keys(changes).join(", ")}.` : "Inventory record saved with no field changes.", actorId: actor.id, actorName: actor.email, metadata: { changes, activityKind: "record-edit" } } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    throw inventoryWriteError(error);
  }

  refreshInventoryViews(id);
  redirect(`/dashboard/inventory/${id}`);
}

export async function retireInventoryItem(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requiredId(formData, "id");
  await prisma.$transaction(async (transaction) => {
    const [item, activeBorrowingCount] = await Promise.all([
      transaction.inventoryItem.findUnique({ where: { id }, select: { status: true } }),
      transaction.borrowRequest.count({ where: { inventoryItemId: id, status: { in: activeBorrowRequestStatuses } } }),
    ]);
    if (!item) throw new Error("This item no longer exists.");
    if (activeBorrowingCount) {
      throw new Error("This item has an active borrowing request. Resolve that request before retiring the record.");
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
              actorName: actor.email,
              metadata: { previousStatus: item.status, status: ItemStatus.RETIRED },
            },
          },
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  refreshInventoryViews(id);
  redirect(`/dashboard/inventory/${id}`);
}

export async function splitGroupedAsset(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requiredId(formData, "id");
  const confirmation = requiredText(formData, "confirmation", 16);
  if (confirmation !== "SPLIT") throw new Error("Type SPLIT to create one record per physical unit.");

  const original = await prisma.inventoryItem.findUnique({ where: { id }, select: { itemType: true, quantity: true, isComputer: true } });
  if (!original || original.itemType !== ItemType.ASSET || original.quantity <= 1) throw new Error("This record is already an individual asset.");
  if (original.isComputer) throw new Error("PC and Mac records must be corrected individually so their names, hardware profiles, and network identifiers remain accurate.");
  const borrowingHistoryCount = await prisma.borrowRequest.count({ where: { inventoryItemId: id } });
  if (borrowingHistoryCount) throw new Error("This grouped asset has borrowing history and cannot be split automatically. Preserve its history, then create individual replacement records for the physical units.");

  try {
    await prisma.$transaction(async (transaction) => {
      const item = await transaction.inventoryItem.findUniqueOrThrow({ where: { id } });
      if (item.itemType !== ItemType.ASSET || item.quantity <= 1 || item.isComputer) throw new Error("This record changed and can no longer be split. Refresh the page and try again.");
      const unitCount = item.quantity;
      await transaction.inventoryItem.update({
        where: { id },
        data: {
          quantity: 1,
          auditEvents: { create: { action: AuditAction.UPDATED, summary: `Grouped asset split into ${unitCount} individually tracked units.`, actorId: actor.id, actorName: actor.email, metadata: { source: "grouped-asset-split", originalQuantity: unitCount, activityKind: "record-edit" } } },
        },
      });
      for (let unitNumber = 2; unitNumber <= unitCount; unitNumber += 1) {
        const assetTag = await nextInventoryAssetTag(transaction, { categoryId: item.categoryId, locationId: item.locationId, status: item.status });
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
            auditEvents: { create: { action: AuditAction.CREATED, summary: `Individual asset created from grouped record: unit ${unitNumber} of ${unitCount}.`, actorId: actor.id, actorName: actor.email, metadata: { source: "grouped-asset-split", sourceItemId: item.id, unitNumber, unitCount, activityKind: "record-create" } } },
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    throw inventoryWriteError(error);
  }

  refreshInventoryViews(id);
  redirect(`/dashboard/inventory/${id}`);
}

export async function markInventoryItemChecked(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requiredId(formData, "id");
  const checkedAt = new Date();

  await prisma.$transaction([
    prisma.inventoryItem.update({ where: { id }, data: { lastCheckedAt: checkedAt } }),
    prisma.computer.updateMany({ where: { itemId: id }, data: { lastCheckedAt: checkedAt } }),
    prisma.inventoryAudit.create({ data: { itemId: id, action: AuditAction.UPDATED, summary: "Item inspection recorded.", actorId: actor.id, actorName: actor.email, metadata: { source: "inspection", checkedAt: checkedAt.toISOString() } } }),
  ]);

  refreshInventoryViews(id);
}

export async function bulkUpdateInventory(formData: FormData) {
  const actor = await requireWriteAccess();
  const ids = selectedIds(formData);
  const action = requiredText(formData, "bulkAction", 64);

  if (action === "delete") {
    if (!canManageAdministration(actor.role)) throw new Error("Only administrators can permanently delete inventory records.");
    const confirmation = requiredText(formData, "bulkRemovalConfirmation", 16);
    if (confirmation !== "DELETE") throw new Error("Type DELETE to permanently remove the selected records.");

    try {
      await prisma.$transaction(async (transaction) => {
        const [selectedCount, borrowingHistoryCount, maintenanceHistoryCount] = await Promise.all([
          transaction.inventoryItem.count({ where: { id: { in: ids } } }),
          transaction.borrowRequest.count({ where: { inventoryItemId: { in: ids } } }),
          transaction.maintenanceTicket.count({ where: { inventoryItemId: { in: ids } } }),
        ]);
        if (selectedCount !== ids.length) throw new Error("One or more selected records no longer exist. Refresh the inventory list and try again.");
        if (borrowingHistoryCount || maintenanceHistoryCount) {
          throw new Error(`Permanent deletion is blocked because the selection has ${borrowingHistoryCount} borrowing and ${maintenanceHistoryCount} maintenance history record${borrowingHistoryCount + maintenanceHistoryCount === 1 ? "" : "s"}. Retire those items instead to preserve their history.`);
        }

        const deleted = await transaction.inventoryItem.deleteMany({ where: { id: { in: ids } } });
        if (deleted.count !== ids.length) throw new Error("One or more selected records changed before deletion. Refresh the inventory list and try again.");
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new Error("One or more selected records gained borrowing or maintenance history. Retire those items instead to preserve that history.");
      }
      throw error;
    }

    refreshInventoryViews();
    redirect("/dashboard/inventory?bulk=deleted");
  }

  let data: Prisma.InventoryItemUncheckedUpdateManyInput;
  let summary: string;
  let targetLocationId: string | null = null;
  const isRetirement = action === "remove" || action === "retire";

  if (action === "location") {
    const locationId = requiredId(formData, "bulkLocationId");
    targetLocationId = locationId;
    data = { locationId };
    summary = "Bulk update: moved to a selected location.";
  } else if (action === "status") {
    const status = enumValue(formData, "bulkStatus", statuses, ItemStatus.OK);
    if (status === ItemStatus.RETIRED) throw new Error("Use the Retire bulk action to remove records from active inventory.");
    data = { status };
    summary = `Bulk update: status changed to ${status}.`;
  } else if (action === "condition") {
    const condition = enumValue(formData, "bulkCondition", conditions, ItemCondition.GOOD);
    data = { condition };
    summary = `Bulk update: condition changed to ${condition}.`;
  } else if (isRetirement) {
    const confirmation = requiredText(formData, "bulkRemovalConfirmation", 16);
    if (confirmation !== "RETIRE") throw new Error("Type RETIRE to remove selected records from active inventory.");
    data = { status: ItemStatus.RETIRED };
    summary = "Bulk update: inventory items removed from active inventory.";
  } else {
    throw new Error("Choose a valid bulk action.");
  }

  await prisma.$transaction(async (transaction) => {
    const selectedCount = await transaction.inventoryItem.count({ where: { id: { in: ids } } });
    if (selectedCount !== ids.length) throw new Error("One or more selected records no longer exist. Refresh the inventory list and try again.");

    if (targetLocationId) {
      const location = await transaction.location.findFirst({ where: { id: targetLocationId, isActive: true }, select: { name: true } });
      if (!location) throw new Error("Choose an active location.");
      summary = `Bulk update: moved to ${location.name}.`;
    }

    if (isRetirement) {
      const activeBorrowingCount = await transaction.borrowRequest.count({
        where: { inventoryItemId: { in: ids }, status: { in: activeBorrowRequestStatuses } },
      });
      if (activeBorrowingCount) {
        throw new Error(`Retirement is blocked because ${activeBorrowingCount} active borrowing request${activeBorrowingCount === 1 ? "" : "s"} still reference the selection. Resolve those requests first.`);
      }
    }

    await transaction.inventoryItem.updateMany({ where: { id: { in: ids } }, data });
    await transaction.inventoryAudit.createMany({
      data: ids.map((itemId) => ({
        itemId,
        action: action === "location" ? AuditAction.MOVED : action === "status" || isRetirement ? AuditAction.STATUS_CHANGED : AuditAction.UPDATED,
        summary,
        actorId: actor.id,
        actorName: actor.email,
        metadata: { bulkAction: action, itemCount: ids.length },
      })),
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  refreshInventoryViews();
  redirect("/dashboard/inventory?bulk=updated");
}

export async function deleteInventoryItem(formData: FormData) {
  await requireAdministrator();
  const id = requiredId(formData, "id");
  const confirmation = requiredText(formData, "confirmation", 16);
  if (confirmation !== "DELETE") throw new Error("Type DELETE to permanently remove this item.");

  const [borrowingHistoryCount, maintenanceHistoryCount] = await Promise.all([
    prisma.borrowRequest.count({ where: { inventoryItemId: id } }),
    prisma.maintenanceTicket.count({ where: { inventoryItemId: id } }),
  ]);
  if (borrowingHistoryCount || maintenanceHistoryCount) {
    throw new Error(`This item has ${borrowingHistoryCount} borrowing and ${maintenanceHistoryCount} maintenance history record${borrowingHistoryCount + maintenanceHistoryCount === 1 ? "" : "s"}. Remove it from active inventory instead to preserve its history.`);
  }

  try {
    await prisma.inventoryItem.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new Error("This item now has borrowing or maintenance history. Remove it from active inventory instead to preserve that history.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new Error("This item no longer exists.");
    throw error;
  }
  refreshInventoryViews(id);
  redirect("/dashboard/inventory");
}

const maximumItemPhotos = 4;
const maximumPhotoBytes = 3 * 1024 * 1024;
const supportedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function photoFileName(value: string) {
  const name = value.replaceAll(/[^a-zA-Z0-9._-]/g, "_").replaceAll(/_+/g, "_").slice(0, 120);
  return name || "item-photo";
}

function imageTypeMatchesBytes(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  return contentType === "image/webp" && bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export async function uploadInventoryItemPhoto(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  if (file.size > maximumPhotoBytes) throw new Error("Each photo must be 3 MB or smaller.");
  if (!supportedPhotoTypes.has(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!imageTypeMatchesBytes(file.type, bytes)) throw new Error("The image file does not match its declared type.");

  await prisma.$transaction(async (transaction) => {
    const [item, photoCount] = await Promise.all([
      transaction.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } }),
      transaction.inventoryItemPhoto.count({ where: { inventoryItemId: itemId } }),
    ]);
    if (!item) throw new Error("This inventory item no longer exists.");
    if (photoCount >= maximumItemPhotos) throw new Error(`Each item can have up to ${maximumItemPhotos} photos.`);
    await transaction.inventoryItemPhoto.create({ data: { inventoryItemId: itemId, fileName: photoFileName(file.name), contentType: file.type, byteSize: bytes.byteLength, data: Buffer.from(bytes) } });
    await transaction.inventoryAudit.create({ data: { itemId, action: AuditAction.UPDATED, summary: "Item photo added.", actorId: actor.id, actorName: actor.email, metadata: { source: "photo-upload", contentType: file.type, byteSize: bytes.byteLength } } });
  });

  refreshInventoryViews(itemId);
}

export async function deleteInventoryItemPhoto(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const photoId = requiredId(formData, "photoId");
  const photo = await prisma.inventoryItemPhoto.findFirst({ where: { id: photoId, inventoryItemId: itemId }, select: { id: true, fileName: true } });
  if (!photo) throw new Error("This photo no longer belongs to the item.");

  await prisma.$transaction([
    prisma.inventoryItemPhoto.delete({ where: { id: photo.id } }),
    prisma.inventoryAudit.create({ data: { itemId, action: AuditAction.UPDATED, summary: `Item photo removed: ${photo.fileName}.`, actorId: actor.id, actorName: actor.email, metadata: { source: "photo-delete" } } }),
  ]);
  refreshInventoryViews(itemId);
}

export async function addComputerDetails(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, include: { computer: true } });
  if (item.computer || !canHaveComputerDetails(item)) throw new Error("Only a PC-designated single tracked asset without an existing PC record can receive PC details.");

  await prisma.$transaction([
    prisma.computer.create({ data: { itemId, ...computerData(formData), lastCheckedAt: new Date() } }),
    prisma.inventoryItem.update({ where: { id: itemId }, data: { lastCheckedAt: new Date() } }),
    prisma.inventoryAudit.create({ data: { itemId, action: AuditAction.UPDATED, summary: "PC hardware record added.", actorId: actor.id, actorName: actor.email, metadata: { source: "manual" } } }),
  ]);

  refreshInventoryViews(itemId);
  redirect(`/dashboard/inventory/${itemId}`);
}

export async function updateComputerDetails(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const computerId = requiredId(formData, "computerId");
  const computer = await requireComputerForItem(itemId, computerId);
  const data = computerData(formData, true);
  const changes = updatedFields(computer, data);

  await prisma.$transaction([
    prisma.computer.update({ where: { id: computer.id }, data }),
    prisma.inventoryItem.update({ where: { id: itemId }, data: { lastCheckedAt: data.lastCheckedAt } }),
    prisma.inventoryAudit.create({ data: { itemId, action: AuditAction.UPDATED, summary: "PC hardware details updated.", actorId: actor.id, actorName: actor.email, metadata: { changes } } }),
  ]);

  refreshInventoryViews(itemId);
  redirect(`/dashboard/inventory/${itemId}`);
}

export async function addComputerSoftware(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const computerId = requiredId(formData, "computerId");
  await requireComputerForItem(itemId, computerId);
  const name = requiredText(formData, "name", 255);

  await prisma.$transaction([
    prisma.computerSoftware.create({
      data: {
        computerId,
        name,
        version: optionalText(formData, "version", 255),
        licenseKeyHint: optionalText(formData, "licenseKeyHint", 255),
        licenseExpiresAt: optionalDate(formData, "licenseExpiresAt"),
        installedAt: optionalDate(formData, "installedAt"),
      },
    }),
    prisma.inventoryAudit.create({ data: { itemId, action: AuditAction.UPDATED, summary: `Software record added: ${name}.`, actorId: actor.id, actorName: actor.email, metadata: { software: name } } }),
  ]);

  refreshInventoryViews(itemId);
  redirect(`/dashboard/inventory/${itemId}`);
}

export async function updateComputerSoftware(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const computerId = requiredId(formData, "computerId");
  const id = requiredId(formData, "id");
  await requireComputerForItem(itemId, computerId);
  const software = await prisma.computerSoftware.findFirst({ where: { id, computerId } });
  if (!software) throw new Error("The software record no longer exists for this PC.");
  const data = {
    name: requiredText(formData, "name", 255),
    version: optionalText(formData, "version", 255),
    licenseKeyHint: optionalText(formData, "licenseKeyHint", 255),
    licenseExpiresAt: optionalDate(formData, "licenseExpiresAt"),
    installedAt: optionalDate(formData, "installedAt"),
  };

  await prisma.$transaction([
    prisma.computerSoftware.update({ where: { id: software.id }, data }),
    prisma.inventoryAudit.create({ data: { itemId, action: AuditAction.UPDATED, summary: `Software record updated: ${data.name}.`, actorId: actor.id, actorName: actor.email, metadata: { changes: updatedFields(software, data) } } }),
  ]);

  refreshInventoryViews(itemId);
  redirect(`/dashboard/inventory/${itemId}`);
}

export async function removeComputerSoftware(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const computerId = requiredId(formData, "computerId");
  const id = requiredId(formData, "id");
  await requireComputerForItem(itemId, computerId);
  const software = await prisma.computerSoftware.findFirst({ where: { id, computerId } });
  if (!software) throw new Error("The software record no longer exists for this PC.");

  await prisma.$transaction([
    prisma.computerSoftware.delete({ where: { id: software.id } }),
    prisma.inventoryAudit.create({ data: { itemId, action: AuditAction.UPDATED, summary: `Software record removed: ${software.name}.`, actorId: actor.id, actorName: actor.email, metadata: { software: software.name } } }),
  ]);

  refreshInventoryViews(itemId);
  redirect(`/dashboard/inventory/${itemId}`);
}
