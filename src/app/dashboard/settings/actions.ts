"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/prisma";
import { auditEventData } from "@/lib/audit-event";
import { nextCategoryAssetTagCode, nextLocationAssetTagCode, normalizeAssetTagCode } from "@/lib/asset-tag";
import { clearSession, hashPassword, passwordValidationMessage, requireAdministrator, requireInventoryAccess, verifyPassword } from "@/lib/inventory-auth";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9._-]{3,32}$/;

function fieldLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function optionalText(formData: FormData, key: string, maximumLength = 500) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maximumLength) throw new Error(`${fieldLabel(key)} is too long.`);
  return value || null;
}

function requiredText(formData: FormData, key: string, maximumLength = 255) {
  const value = optionalText(formData, key, maximumLength);
  if (!value) throw new Error(`${fieldLabel(key)} is required.`);
  return value;
}

function requiredId(formData: FormData) {
  const id = requiredText(formData, "id", 64);
  if (!uuidPattern.test(id)) throw new Error("Invalid setup record.");
  return id;
}

function optionalAssetTagCode(formData: FormData, key: string, length: number) {
  const value = optionalText(formData, key, length);
  if (!value) return null;
  const code = normalizeAssetTagCode(value, length);
  if (!code) throw new Error(`${fieldLabel(key)} must use exactly ${length} letters or numbers.`);
  return code;
}

async function categoryAssetTagCode(formData: FormData, name: string, currentId?: string) {
  const supplied = optionalAssetTagCode(formData, "assetTagCode", 3);
  if (supplied) return supplied;
  const codes = await prisma.category.findMany({ where: currentId ? { id: { not: currentId } } : undefined, select: { assetTagCode: true } });
  return nextCategoryAssetTagCode(name, codes.map((category) => category.assetTagCode));
}

async function locationAssetTagCode(formData: FormData, currentId?: string) {
  const supplied = optionalAssetTagCode(formData, "assetTagCode", 2);
  if (supplied) return supplied;
  const codes = await prisma.location.findMany({ where: currentId ? { id: { not: currentId } } : undefined, select: { assetTagCode: true } });
  return nextLocationAssetTagCode(codes.map((location) => location.assetTagCode));
}

function accountEmail(formData: FormData) {
  const email = requiredText(formData, "email", 254).toLowerCase();
  if (!emailPattern.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function accountUsername(formData: FormData) {
  const username = requiredText(formData, "username", 32).toLowerCase();
  if (!usernamePattern.test(username)) {
    throw new Error("Use 3–32 letters, numbers, periods, underscores, or hyphens for the username.");
  }
  return username;
}

function currentPassword(formData: FormData) {
  const password = String(formData.get("currentPassword") ?? "");
  if (password.length > 256) throw new Error("Passwords must be 256 characters or fewer.");
  return password;
}

function newPassword(formData: FormData) {
  const password = String(formData.get("newPassword") ?? "");
  if (!password) return null;
  if (password.length > 256) throw new Error("Passwords must be 256 characters or fewer.");
  const message = passwordValidationMessage(password);
  if (message) throw new Error(message);
  return password;
}

function accountWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("That email address or username is already assigned to an account.");
  }
  return error;
}

export async function updateOwnAccount(formData: FormData) {
  const actor = await requireInventoryAccess();
  const email = accountEmail(formData);
  const username = accountUsername(formData);
  const password = newPassword(formData);
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const current = currentPassword(formData);

  if (!password && confirmation) throw new Error("Enter a new password before confirming it.");
  if (password && password !== confirmation) throw new Error("The new password and confirmation do not match.");

  const account = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { email: true, passwordHash: true, username: true },
  });
  if (!account) throw new Error("Your account is no longer available.");

  const identityChanged = account.email !== email || account.username !== username;
  if (!identityChanged && !password) throw new Error("Make a change before saving your account.");
  if (!current) throw new Error("Enter your current password to update your account.");
  if (!(await verifyPassword(current, account.passwordHash))) throw new Error("Your current password is incorrect.");

  try {
    await prisma.$transaction(async (transaction) => {
      const updatedAccount = await transaction.user.update({
        where: { id: actor.id },
        data: { email, username, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
      });
      if (password) await transaction.userSession.deleteMany({ where: { userId: actor.id } });
      await transaction.inventoryAudit.create({
        data: auditEventData({
          action: "UPDATED",
          actor,
          entity: { id: updatedAccount.id, label: `${updatedAccount.username} | ${updatedAccount.email}`, type: "account" },
          metadata: { activityKind: "account", changes: { email: account.email !== email ? email : undefined, passwordUpdated: Boolean(password), username: account.username !== username ? username : undefined }, sessionsRevoked: Boolean(password) },
          summary: "Own account settings updated.",
        }),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    throw accountWriteError(error);
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");

  if (password) {
    await clearSession();
    redirect("/auth/login?notice=password-updated");
  }
}

function refreshSetupPages() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard/inventory");
}

function setupWriteError(error: unknown, label: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error(`A ${label.toLowerCase()} with that name or asset-tag code already exists.`);
  }
  return error;
}

export async function createCategory(formData: FormData) {
  const actor = await requireAdministrator();
  const name = requiredText(formData, "name");
  try {
    const category = await prisma.category.create({ data: { name, assetTagCode: await categoryAssetTagCode(formData, name), description: optionalText(formData, "description", 2_000) } });
    await prisma.inventoryAudit.create({ data: auditEventData({ action: "CREATED", actor, entity: { id: category.id, label: category.name, type: "category" }, metadata: { activityKind: "configuration", assetTagCode: category.assetTagCode }, summary: "Category created." }) });
  } catch (error) {
    throw setupWriteError(error, "category");
  }
  refreshSetupPages();
}

export async function updateCategory(formData: FormData) {
  const actor = await requireAdministrator();
  const id = requiredId(formData);
  const name = requiredText(formData, "name");
  try {
    const category = await prisma.category.update({ where: { id }, data: { name, assetTagCode: await categoryAssetTagCode(formData, name, id), description: optionalText(formData, "description", 2_000) } });
    await prisma.inventoryAudit.create({ data: auditEventData({ action: "UPDATED", actor, entity: { id: category.id, label: category.name, type: "category" }, metadata: { activityKind: "configuration", assetTagCode: category.assetTagCode }, summary: "Category updated." }) });
  } catch (error) {
    throw setupWriteError(error, "category");
  }
  refreshSetupPages();
}

export async function createLocation(formData: FormData) {
  const actor = await requireAdministrator();
  try {
    const location = await prisma.location.create({
      data: {
        name: requiredText(formData, "name"),
        assetTagCode: await locationAssetTagCode(formData),
        roomNumber: optionalText(formData, "roomNumber", 100),
        description: optionalText(formData, "description", 2_000),
      },
    });
    await prisma.inventoryAudit.create({ data: auditEventData({ action: "CREATED", actor, entity: { id: location.id, label: location.name, type: "location" }, metadata: { activityKind: "configuration", assetTagCode: location.assetTagCode, roomNumber: location.roomNumber ?? "" }, summary: "Location created." }) });
  } catch (error) {
    throw setupWriteError(error, "location");
  }
  refreshSetupPages();
}

export async function updateLocation(formData: FormData) {
  const actor = await requireAdministrator();
  const id = requiredId(formData);
  try {
    const location = await prisma.location.update({
      where: { id },
      data: {
        name: requiredText(formData, "name"),
        assetTagCode: await locationAssetTagCode(formData, id),
        roomNumber: optionalText(formData, "roomNumber", 100),
        description: optionalText(formData, "description", 2_000),
      },
    });
    await prisma.inventoryAudit.create({ data: auditEventData({ action: "UPDATED", actor, entity: { id: location.id, label: location.name, type: "location" }, metadata: { activityKind: "configuration", assetTagCode: location.assetTagCode, roomNumber: location.roomNumber ?? "" }, summary: "Location updated." }) });
  } catch (error) {
    throw setupWriteError(error, "location");
  }
  refreshSetupPages();
}

export async function setCategoryActive(formData: FormData) {
  const actor = await requireAdministrator();
  const isActive = String(formData.get("isActive")) === "true";
  const category = await prisma.category.update({ where: { id: requiredId(formData) }, data: { isActive } });
  await prisma.inventoryAudit.create({ data: auditEventData({ action: "UPDATED", actor, entity: { id: category.id, label: category.name, type: "category" }, metadata: { activityKind: "configuration", isActive }, summary: `Category ${isActive ? "activated" : "deactivated"}.` }) });
  refreshSetupPages();
}

export async function setLocationActive(formData: FormData) {
  const actor = await requireAdministrator();
  const isActive = String(formData.get("isActive")) === "true";
  const location = await prisma.location.update({ where: { id: requiredId(formData) }, data: { isActive } });
  await prisma.inventoryAudit.create({ data: auditEventData({ action: "UPDATED", actor, entity: { id: location.id, label: location.name, type: "location" }, metadata: { activityKind: "configuration", isActive }, summary: `Location ${isActive ? "activated" : "deactivated"}.` }) });
  refreshSetupPages();
}

export async function deleteLocation(formData: FormData) {
  const actor = await requireAdministrator();
  const id = requiredId(formData);
  const confirmation = requiredText(formData, "confirmation", 16);
  if (confirmation !== "DELETE") throw new Error("Type DELETE to permanently remove this location.");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(async (transaction) => {
        const location = await transaction.location.findUnique({
          where: { id },
          select: { _count: { select: { items: true } }, id: true, name: true },
        });

        if (!location) throw new Error("This location no longer exists.");
        if (location._count.items > 0) {
          throw new Error(`Move or remove the ${location._count.items} inventory record${location._count.items === 1 ? "" : "s"} assigned to this location before deleting it.`);
        }

        await transaction.inventoryAudit.create({ data: auditEventData({ action: "DELETED", actor, entity: { id: location.id, label: location.name, type: "location" }, metadata: { activityKind: "configuration" }, summary: "Location permanently deleted." }) });
        await transaction.location.delete({ where: { id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      refreshSetupPages();
      return;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new Error("This location now has an inventory record assigned to it. Move or remove that record before deleting the location.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("The location was updated by another request. Please try again.");
}
