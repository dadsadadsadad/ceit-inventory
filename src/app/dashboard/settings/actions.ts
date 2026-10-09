"use server";

import { FormError, formAction } from "@/lib/form-action";
import { fieldLabel, optionalText, requiredText, requiredUuid } from "@/lib/form-fields";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/prisma";
import { auditEventData } from "@/lib/audit-event";
import {
  nextCategoryAssetTagCode,
  nextLocationAssetTagCode,
  normalizeAssetTagCode,
} from "@/lib/asset-tag";
import {
  clearSession,
  hashPassword,
  passwordValidationMessage,
  requireInventoryAccess,
  requireWriteAccess,
  verifyPassword,
} from "@/lib/inventory-auth";
import { isAccountLocked, recordFailedPassword } from "@/lib/account-lock";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9._-]{3,32}$/;

function requiredId(formData: FormData) {
  return requiredUuid(formData, "id", "Invalid setup record.");
}

function optionalAssetTagCode(formData: FormData, key: string, length: number) {
  const value = optionalText(formData, key, length);
  if (!value) {
    return null;
  }
  const code = normalizeAssetTagCode(value, length);
  if (!code) {
    throw new FormError(`${fieldLabel(key)} must use exactly ${length} letters or numbers.`);
  }
  return code;
}

// Keep or choose an unused category code.
async function categoryAssetTagCode(formData: FormData, name: string, currentId?: string) {
  const supplied = optionalAssetTagCode(formData, "assetTagCode", 3);
  if (supplied) {
    return supplied;
  }
  const codes = await prisma.category.findMany({
    where: currentId ? { id: { not: currentId } } : undefined,
    select: { assetTagCode: true },
  });
  return nextCategoryAssetTagCode(
    name,
    codes.map((category) => category.assetTagCode),
  );
}

// Keep or choose an unused room code.
async function locationAssetTagCode(formData: FormData, currentId?: string) {
  const supplied = optionalAssetTagCode(formData, "assetTagCode", 2);
  if (supplied && !/^\d{2}$/.test(supplied)) {
    throw new FormError("Use two digits for the room tag code, such as 05.");
  }
  if (supplied) {
    return supplied;
  }
  const codes = await prisma.location.findMany({
    where: currentId ? { id: { not: currentId } } : undefined,
    select: { assetTagCode: true },
  });
  return nextLocationAssetTagCode(codes.map((location) => location.assetTagCode));
}

function accountEmail(formData: FormData) {
  const email = requiredText(formData, "email", 254).toLowerCase();
  if (!emailPattern.test(email)) {
    throw new FormError("Enter a valid email address.");
  }
  return email;
}

function accountUsername(formData: FormData) {
  const username = requiredText(formData, "username", 32).toLowerCase();
  if (!usernamePattern.test(username)) {
    throw new FormError(
      "Use 3–32 letters, numbers, periods, underscores, or hyphens for the username.",
    );
  }
  return username;
}

function currentPassword(formData: FormData) {
  const password = String(formData.get("currentPassword") ?? "");
  if (password.length > 256) {
    throw new FormError("Passwords must be 256 characters or fewer.");
  }
  return password;
}

function newPassword(formData: FormData) {
  const password = String(formData.get("newPassword") ?? "");
  if (!password) {
    return null;
  }
  if (password.length > 256) {
    throw new FormError("Passwords must be 256 characters or fewer.");
  }
  const message = passwordValidationMessage(password);
  if (message) {
    throw new FormError(message);
  }
  return password;
}

function accountWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new FormError("That email address or username is already assigned to an account.");
  }
  return error;
}

// Account settings.
export async function updateOwnAccount(formData: FormData) {
  return formAction(async () => {
    const actor = await requireInventoryAccess();
    const email = accountEmail(formData);
    const username = accountUsername(formData);
    const password = newPassword(formData);
    const confirmation = String(formData.get("confirmPassword") ?? "");
    const current = currentPassword(formData);

    if (!password && confirmation) {
      throw new FormError("Enter a new password before confirming it.");
    }
    if (password && password !== confirmation) {
      throw new FormError("The new password and confirmation do not match.");
    }

    const account = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { email: true, lockedUntil: true, passwordHash: true, username: true },
    });
    if (!account) {
      throw new FormError("Your account is no longer available.");
    }

    const identityChanged = account.email !== email || account.username !== username;
    if (!identityChanged && !password) {
      throw new FormError("Make a change before saving your account.");
    }
    if (!current) {
      throw new FormError("Enter your current password to update your account.");
    }
    // Wrong guesses here count toward the same lock as sign-in, so a borrowed session cannot be
    // used to try password after password.
    if (isAccountLocked(account)) {
      throw new FormError(
        "Too many wrong passwords were entered. Wait about 15 minutes before trying again.",
      );
    }
    if (!(await verifyPassword(current, account.passwordHash))) {
      await recordFailedPassword(actor.id);
      throw new FormError("Your current password is incorrect.");
    }

    try {
      await prisma.$transaction(
        async (transaction) => {
          const updatedAccount = await transaction.user.update({
            where: { id: actor.id },
            data: {
              email,
              username,
              ...(password ? { passwordHash: await hashPassword(password) } : {}),
            },
          });
          if (password) {
            await transaction.userSession.deleteMany({ where: { userId: actor.id } });
          }
          await transaction.inventoryAudit.create({
            data: auditEventData({
              action: "UPDATED",
              actor,
              entity: {
                id: updatedAccount.id,
                label: `${updatedAccount.username} | ${updatedAccount.email}`,
                type: "account",
              },
              metadata: {
                activityKind: "account",
                changes: {
                  email: account.email !== email ? email : undefined,
                  passwordUpdated: Boolean(password),
                  username: account.username !== username ? username : undefined,
                },
                sessionsRevoked: Boolean(password),
              },
              summary: "Own account settings updated.",
            }),
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw accountWriteError(error);
    }

    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/settings");

    if (password) {
      await clearSession();
      redirect("/auth/login?notice=password-updated");
    }
  });
}

// Refresh the forms that use categories and rooms.
function refreshSetupPages() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard/inventory");
}

function setupWriteError(error: unknown, label: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new FormError(
      `A ${label.toLowerCase()} with that name or asset-tag code already exists.`,
    );
  }
  return error;
}

// Categories and rooms.
export async function createCategory(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const name = requiredText(formData, "name");
    try {
      const category = await prisma.category.create({
        data: {
          name,
          assetTagCode: await categoryAssetTagCode(formData, name),
          description: optionalText(formData, "description", 2_000),
        },
      });
      await prisma.inventoryAudit.create({
        data: auditEventData({
          action: "CREATED",
          actor,
          entity: { id: category.id, label: category.name, type: "category" },
          metadata: { activityKind: "configuration", assetTagCode: category.assetTagCode },
          summary: "Category created.",
        }),
      });
    } catch (error) {
      throw setupWriteError(error, "category");
    }
    refreshSetupPages();
  });
}

// Save the category name and tag code.
export async function updateCategory(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData);
    const name = requiredText(formData, "name");
    try {
      const category = await prisma.category.update({
        where: { id },
        data: {
          name,
          assetTagCode: await categoryAssetTagCode(formData, name, id),
          description: optionalText(formData, "description", 2_000),
        },
      });
      await prisma.inventoryAudit.create({
        data: auditEventData({
          action: "UPDATED",
          actor,
          entity: { id: category.id, label: category.name, type: "category" },
          metadata: { activityKind: "configuration", assetTagCode: category.assetTagCode },
          summary: "Category updated.",
        }),
      });
    } catch (error) {
      throw setupWriteError(error, "category");
    }
    refreshSetupPages();
  });
}

// Add a room with its asset-tag code.
export async function createLocation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    try {
      const location = await prisma.location.create({
        data: {
          name: requiredText(formData, "name"),
          assetTagCode: await locationAssetTagCode(formData),
          roomNumber: optionalText(formData, "roomNumber", 100),
          description: optionalText(formData, "description", 2_000),
        },
      });
      await prisma.inventoryAudit.create({
        data: auditEventData({
          action: "CREATED",
          actor,
          entity: { id: location.id, label: location.name, type: "location" },
          metadata: {
            activityKind: "configuration",
            assetTagCode: location.assetTagCode,
            roomNumber: location.roomNumber ?? "",
          },
          summary: "Location created.",
        }),
      });
    } catch (error) {
      throw setupWriteError(error, "location");
    }
    refreshSetupPages();
  });
}

// Save room details and its tag code.
export async function updateLocation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
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
      await prisma.inventoryAudit.create({
        data: auditEventData({
          action: "UPDATED",
          actor,
          entity: { id: location.id, label: location.name, type: "location" },
          metadata: {
            activityKind: "configuration",
            assetTagCode: location.assetTagCode,
            roomNumber: location.roomNumber ?? "",
          },
          summary: "Location updated.",
        }),
      });
    } catch (error) {
      throw setupWriteError(error, "location");
    }
    refreshSetupPages();
  });
}

// Enable or disable a category for new assignments.
export async function setCategoryActive(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const isActive = String(formData.get("isActive")) === "true";
    const category = await prisma.category.update({
      where: { id: requiredId(formData) },
      data: { isActive },
    });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "UPDATED",
        actor,
        entity: { id: category.id, label: category.name, type: "category" },
        metadata: { activityKind: "configuration", isActive },
        summary: `Category ${isActive ? "activated" : "deactivated"}.`,
      }),
    });
    refreshSetupPages();
  });
}

// Enable or disable a room for new assignments.
export async function setLocationActive(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const isActive = String(formData.get("isActive")) === "true";
    const location = await prisma.location.update({
      where: { id: requiredId(formData) },
      data: { isActive },
    });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "UPDATED",
        actor,
        entity: { id: location.id, label: location.name, type: "location" },
        metadata: { activityKind: "configuration", isActive },
        summary: `Location ${isActive ? "activated" : "deactivated"}.`,
      }),
    });
    refreshSetupPages();
  });
}

// Remove an unused category.
export async function deleteCategory(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData);
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "DELETE") {
      throw new FormError("Type DELETE to permanently remove this category.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (transaction) => {
            const category = await transaction.category.findUnique({
              where: { id },
              select: { _count: { select: { items: true } }, id: true, name: true },
            });

            if (!category) {
              throw new FormError("This category no longer exists.");
            }
            if (category._count.items > 0) {
              throw new FormError(
                `Reassign or remove the ${category._count.items} inventory record${category._count.items === 1 ? "" : "s"} in this category before deleting it. You can deactivate it instead.`,
              );
            }

            await transaction.inventoryAudit.create({
              data: auditEventData({
                action: "DELETED",
                actor,
                entity: { id: category.id, label: category.name, type: "category" },
                metadata: { activityKind: "configuration" },
                summary: "Category permanently deleted.",
              }),
            });
            await transaction.category.delete({ where: { id } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        refreshSetupPages();
        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new FormError(
            "This category now has an inventory record assigned to it. Reassign or remove that record before deleting the category.",
          );
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new FormError("The category was updated by another request. Please try again.");
  });
}

// Remove an unused room.
export async function deleteLocation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData);
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "DELETE") {
      throw new FormError("Type DELETE to permanently remove this location.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (transaction) => {
            const location = await transaction.location.findUnique({
              where: { id },
              select: { _count: { select: { items: true } }, id: true, name: true },
            });

            if (!location) {
              throw new FormError("This location no longer exists.");
            }
            if (location._count.items > 0) {
              throw new FormError(
                `Move or remove the ${location._count.items} inventory record${location._count.items === 1 ? "" : "s"} assigned to this location before deleting it.`,
              );
            }

            await transaction.inventoryAudit.create({
              data: auditEventData({
                action: "DELETED",
                actor,
                entity: { id: location.id, label: location.name, type: "location" },
                metadata: { activityKind: "configuration" },
                summary: "Location permanently deleted.",
              }),
            });
            await transaction.location.delete({ where: { id } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        refreshSetupPages();
        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new FormError(
            "This location now has an inventory record assigned to it. Move or remove that record before deleting the location.",
          );
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new FormError("The location was updated by another request. Please try again.");
  });
}
