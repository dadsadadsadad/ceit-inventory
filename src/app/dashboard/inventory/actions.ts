"use server";

import { AuditAction, ItemCondition, ItemStatus, ItemType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdministrator, requireWriteAccess } from "@/lib/inventory-auth";
import { canHaveComputerDetails, isSingleTrackedAsset } from "@/lib/inventory-pc";
import { prisma } from "@/prisma";

const statuses = Object.values(ItemStatus);
const conditions = Object.values(ItemCondition);
const itemTypes = Object.values(ItemType);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumBulkSelection = 10_000;

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
  if (isComputer && !isSingleTrackedAsset({ itemType, quantity })) throw new Error("A PC must be a single tracked asset, not a supply record.");
  await assertActiveAssignments(categoryId, locationId);

  const item = await prisma.inventoryItem.create({
    data: {
      name: requiredText(formData, "name", 255),
      assetTag: identifier(formData, "assetTag"),
      categoryId,
      locationId,
      itemType,
      isComputer,
      quantity,
      status: enumValue(formData, "status", statuses, ItemStatus.OK),
      condition: enumValue(formData, "condition", conditions, ItemCondition.GOOD),
      description: optionalText(formData, "description", 5_000),
      manufacturer: optionalText(formData, "manufacturer", 255),
      model: optionalText(formData, "model", 255),
      serialNumber: identifier(formData, "serialNumber"),
      purchaseDate: optionalDate(formData, "purchaseDate"),
      purchasePrice: optionalPurchasePrice(formData),
      notes: optionalText(formData, "notes", 5_000),
      computer: isComputer ? { create: { ...computerData(formData), lastCheckedAt: new Date() } } : undefined,
      auditEvents: { create: { action: AuditAction.CREATED, summary: "Inventory item created.", actorId: actor.id, actorName: actor.email, metadata: { source: "manual", activityKind: "record-create" } } },
    },
  });

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
  if (isComputer && !isSingleTrackedAsset({ itemType, quantity })) throw new Error("A PC must be a single tracked asset, not a supply record.");
  await assertActiveAssignments(categoryId, locationId, existing);

  const data = {
    name: requiredText(formData, "name", 255),
    assetTag: identifier(formData, "assetTag"),
    categoryId,
    locationId,
    itemType,
    isComputer,
    status: enumValue(formData, "status", statuses, existing.status),
    condition: enumValue(formData, "condition", conditions, existing.condition),
    quantity,
    description: optionalText(formData, "description", 5_000),
    manufacturer: optionalText(formData, "manufacturer", 255),
    model: optionalText(formData, "model", 255),
    serialNumber: identifier(formData, "serialNumber"),
    purchaseDate: optionalDate(formData, "purchaseDate"),
    purchasePrice: optionalPurchasePrice(formData),
    notes: optionalText(formData, "notes", 5_000),
  };
  const changes = updatedFields(existing, data);
  const action = Object.keys(changes).length === 1 && "locationId" in changes ? AuditAction.MOVED : Object.keys(changes).length === 1 && "status" in changes ? AuditAction.STATUS_CHANGED : AuditAction.UPDATED;

  await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...data,
      auditEvents: { create: { action, summary: Object.keys(changes).length ? `Updated ${Object.keys(changes).join(", ")}.` : "Inventory record saved with no field changes.", actorId: actor.id, actorName: actor.email, metadata: { changes, activityKind: "record-edit" } } },
    },
  });

  refreshInventoryViews(id);
  redirect(`/dashboard/inventory/${id}`);
}

export async function retireInventoryItem(formData: FormData) {
  const actor = await requireWriteAccess();
  const id = requiredId(formData, "id");
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id }, select: { status: true } });

  if (item.status !== ItemStatus.RETIRED) {
    await prisma.inventoryItem.update({
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

  refreshInventoryViews(id);
  redirect(`/dashboard/inventory/${id}`);
}

export async function bulkUpdateInventory(formData: FormData) {
  const actor = await requireWriteAccess();
  const ids = selectedIds(formData);
  const action = requiredText(formData, "bulkAction", 64);
  let data: Prisma.InventoryItemUncheckedUpdateManyInput;
  let summary: string;

  if (action === "location") {
    const locationId = requiredId(formData, "bulkLocationId");
    const location = await prisma.location.findFirst({ where: { id: locationId, isActive: true }, select: { name: true } });
    if (!location) throw new Error("Choose an active location.");
    data = { locationId };
    summary = `Bulk update: moved to ${location.name}.`;
  } else if (action === "status") {
    const status = enumValue(formData, "bulkStatus", statuses, ItemStatus.OK);
    data = { status };
    summary = `Bulk update: status changed to ${status}.`;
  } else if (action === "condition") {
    const condition = enumValue(formData, "bulkCondition", conditions, ItemCondition.GOOD);
    data = { condition };
    summary = `Bulk update: condition changed to ${condition}.`;
  } else if (action === "remove" || action === "retire") {
    const confirmation = requiredText(formData, "bulkRemovalConfirmation", 16);
    if (confirmation !== "RETIRE") throw new Error("Type RETIRE to remove selected records from active inventory.");
    data = { status: ItemStatus.RETIRED };
    summary = "Bulk update: inventory items removed from active inventory.";
  } else {
    throw new Error("Choose a valid bulk action.");
  }

  await prisma.$transaction([
    prisma.inventoryItem.updateMany({ where: { id: { in: ids } }, data }),
    prisma.inventoryAudit.createMany({
      data: ids.map((itemId) => ({
        itemId,
        action: action === "location" ? AuditAction.MOVED : action === "status" || action === "remove" || action === "retire" ? AuditAction.STATUS_CHANGED : AuditAction.UPDATED,
        summary,
        actorId: actor.id,
        actorName: actor.email,
        metadata: { bulkAction: action, itemCount: ids.length },
      })),
    }),
  ]);
  refreshInventoryViews();
  redirect("/dashboard/inventory?bulk=updated");
}

export async function deleteInventoryItem(formData: FormData) {
  await requireAdministrator();
  const id = requiredId(formData, "id");
  const confirmation = requiredText(formData, "confirmation", 16);
  if (confirmation !== "DELETE") throw new Error("Type DELETE to permanently remove this item.");

  const borrowingHistoryCount = await prisma.borrowRequest.count({ where: { inventoryItemId: id } });
  if (borrowingHistoryCount) {
    throw new Error(`This item has ${borrowingHistoryCount} borrowing request${borrowingHistoryCount === 1 ? "" : "s"}. Remove it from active inventory instead to preserve the borrowing history.`);
  }

  try {
    await prisma.inventoryItem.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new Error("This item now has borrowing history. Remove it from active inventory instead to preserve that history.");
    }
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
