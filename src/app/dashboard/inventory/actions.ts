"use server";

import { AuditAction, ItemCondition, ItemStatus, ItemType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdministrator, requireWriteAccess } from "@/lib/supabase/server";
import { prisma } from "@/prisma";

const statuses = Object.values(ItemStatus);
const conditions = Object.values(ItemCondition);
const itemTypes = Object.values(ItemType);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function optionalDate(formData: FormData, key: string) {
  const value = optionalText(formData, key, 10);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${key} is not a valid date.`);
  return parsed;
}

function optionalImageUrl(formData: FormData) {
  const value = optionalText(formData, "imageUrl", 2_000);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new Error("imageUrl must be an http or https URL.");
  }
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
  if (isComputer && (itemType !== ItemType.ASSET || quantity !== 1)) throw new Error("A PC must be a single tracked asset, not a supply record.");
  await assertActiveAssignments(categoryId, locationId);

  const item = await prisma.inventoryItem.create({
    data: {
      name: requiredText(formData, "name", 255),
      assetTag: identifier(formData, "assetTag"),
      categoryId,
      locationId,
      itemType,
      quantity,
      status: enumValue(formData, "status", statuses, ItemStatus.OK),
      condition: enumValue(formData, "condition", conditions, ItemCondition.GOOD),
      description: optionalText(formData, "description", 5_000),
      manufacturer: optionalText(formData, "manufacturer", 255),
      model: optionalText(formData, "model", 255),
      serialNumber: identifier(formData, "serialNumber"),
      purchaseDate: optionalDate(formData, "purchaseDate"),
      warrantyEndsAt: optionalDate(formData, "warrantyEndsAt"),
      imageUrl: optionalImageUrl(formData),
      notes: optionalText(formData, "notes", 5_000),
      computer: isComputer ? { create: { ...computerData(formData), lastCheckedAt: new Date() } } : undefined,
      auditEvents: { create: { action: AuditAction.CREATED, summary: "Inventory item created.", actorId: actor.id, actorName: actor.email, metadata: { source: "manual" } } },
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
  if (existing.computer && (itemType !== ItemType.ASSET || quantity !== 1)) throw new Error("A PC must remain a single tracked asset.");
  await assertActiveAssignments(categoryId, locationId, existing);

  const data = {
    name: requiredText(formData, "name", 255),
    assetTag: identifier(formData, "assetTag"),
    categoryId,
    locationId,
    itemType,
    status: enumValue(formData, "status", statuses, existing.status),
    condition: enumValue(formData, "condition", conditions, existing.condition),
    quantity,
    description: optionalText(formData, "description", 5_000),
    manufacturer: optionalText(formData, "manufacturer", 255),
    model: optionalText(formData, "model", 255),
    serialNumber: identifier(formData, "serialNumber"),
    purchaseDate: optionalDate(formData, "purchaseDate"),
    warrantyEndsAt: optionalDate(formData, "warrantyEndsAt"),
    imageUrl: optionalImageUrl(formData),
    notes: optionalText(formData, "notes", 5_000),
  };
  const changes = updatedFields(existing, data);
  const action = Object.keys(changes).length === 1 && "locationId" in changes ? AuditAction.MOVED : Object.keys(changes).length === 1 && "status" in changes ? AuditAction.STATUS_CHANGED : AuditAction.UPDATED;

  await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...data,
      auditEvents: { create: { action, summary: Object.keys(changes).length ? `Updated ${Object.keys(changes).join(", ")}.` : "Inventory record saved with no field changes.", actorId: actor.id, actorName: actor.email, metadata: { changes } } },
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
            summary: "Inventory item retired.",
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

export async function deleteInventoryItem(formData: FormData) {
  await requireAdministrator();
  const id = requiredId(formData, "id");
  const confirmation = requiredText(formData, "confirmation", 16);
  if (confirmation !== "DELETE") throw new Error("Type DELETE to permanently remove this item.");

  const borrowingHistoryCount = await prisma.borrowRequest.count({ where: { inventoryItemId: id } });
  if (borrowingHistoryCount) {
    throw new Error(`This item has ${borrowingHistoryCount} borrowing request${borrowingHistoryCount === 1 ? "" : "s"}. Retire it instead to preserve the borrowing history.`);
  }

  try {
    await prisma.inventoryItem.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new Error("This item now has borrowing history. Retire it instead to preserve that history.");
    }
    throw error;
  }
  refreshInventoryViews(id);
  redirect("/dashboard/inventory");
}

export async function addComputerDetails(formData: FormData) {
  const actor = await requireWriteAccess();
  const itemId = requiredId(formData, "itemId");
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, include: { computer: true } });
  if (item.computer || item.itemType !== ItemType.ASSET || item.quantity !== 1) throw new Error("Only a single tracked asset without an existing PC record can receive PC details.");

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
