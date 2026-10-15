"use server";

import { FormError, formAction } from "@/lib/form-action";
import { requiredText, requiredUuid } from "@/lib/form-fields";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auditEventData } from "@/lib/audit-event";
import { hashPassword, passwordValidationMessage, requireUserManager } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const roles = Object.values(UserRole);
const usernamePattern = /^[a-z0-9._-]{3,32}$/;

function idFrom(formData: FormData) {
  return requiredUuid(formData, "id", "Invalid account identifier.");
}

function emailFrom(formData: FormData) {
  const email = requiredText(formData, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new FormError("Enter a valid email address.");
  }
  return email;
}

function usernameFrom(formData: FormData) {
  const username = requiredText(formData, "username", 32).toLowerCase();
  if (!usernamePattern.test(username)) {
    throw new FormError("Usernames are 3-32 letters, numbers, . _ or -");
  }
  return username;
}

function roleFrom(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  if (!roles.includes(role as UserRole)) {
    throw new FormError("Pick a valid role.");
  }
  return role as UserRole;
}

function passwordFrom(formData: FormData, required: boolean) {
  const password = String(formData.get("password") ?? "");
  if (!password && !required) {
    return null;
  }
  if (password.length > 256) {
    throw new FormError("Password is too long.");
  }
  const message = passwordValidationMessage(password);
  if (message) {
    throw new FormError(message);
  }
  return password;
}

function knownWriteError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createUser(formData: FormData) {
  return formAction(async () => {
    const administrator = await requireUserManager();
    const password = passwordFrom(formData, true);
    if (!password) {
      throw new FormError("Enter a password.");
    }
    const email = emailFrom(formData);
    const username = usernameFrom(formData);
    const role = roleFrom(formData);

    try {
      await prisma.$transaction(async (tx) => {
        const account = await tx.user.create({
          data: { email, username, passwordHash: await hashPassword(password), role },
        });
        await tx.inventoryAudit.create({
          data: auditEventData({
            action: "CREATED",
            actor: administrator,
            entity: {
              id: account.id,
              label: `${account.username} | ${account.email}`,
              type: "account",
            },
            metadata: { activityKind: "account", role: account.role, isActive: account.isActive },
            summary: "Account created.",
          }),
        });
      });
    } catch (error) {
      if (knownWriteError(error)) {
        throw new FormError("That email or username is already taken.");
      }
      throw error;
    }

    revalidatePath("/dashboard/users");
    redirect("/dashboard/users");
  });
}

// can't remove the last admin
export async function updateUser(formData: FormData) {
  return formAction(async () => {
    const administrator = await requireUserManager();
    const id = idFrom(formData);
    const role = roleFrom(formData);
    const isActive = formData.get("isActive") === "on";
    const password = passwordFrom(formData, false);
    const email = emailFrom(formData);
    const username = usernameFrom(formData);
    const passwordHash = password ? await hashPassword(password) : null;

    if (id === administrator.id && (!isActive || role !== UserRole.ADMINISTRATOR)) {
      throw new FormError("You can't deactivate or demote your own account.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const target = await tx.user.findUnique({ where: { id } });
            if (!target) {
              throw new FormError("This account no longer exists.");
            }

            const removesAdministrator =
              target.role === UserRole.ADMINISTRATOR &&
              target.isActive &&
              (!isActive || role !== UserRole.ADMINISTRATOR);
            if (removesAdministrator) {
              const activeAdministratorCount = await tx.user.count({
                where: { role: UserRole.ADMINISTRATOR, isActive: true },
              });
              if (activeAdministratorCount <= 1) {
                throw new FormError("There has to be at least one active admin.");
              }
            }

            const account = await tx.user.update({
              where: { id },
              data: {
                email,
                username,
                role,
                isActive,
                // resetting also unlocks the account
                ...(passwordHash
                  ? {
                      passwordHash,
                      failedSignInCount: 0,
                      firstFailedSignInAt: null,
                      lockedUntil: null,
                    }
                  : {}),
              },
            });
            if (passwordHash || !isActive) {
              await tx.userSession.deleteMany({ where: { userId: id } });
            }
            await tx.inventoryAudit.create({
              data: auditEventData({
                action: "UPDATED",
                actor: administrator,
                entity: {
                  id: account.id,
                  label: `${account.username} | ${account.email}`,
                  type: "account",
                },
                metadata: {
                  activityKind: "account",
                  changes: {
                    email: target.email !== email ? email : undefined,
                    isActive: target.isActive !== isActive ? isActive : undefined,
                    passwordReset: Boolean(passwordHash),
                    role: target.role !== role ? role : undefined,
                    username: target.username !== username ? username : undefined,
                  },
                  sessionsRevoked: Boolean(passwordHash || !isActive),
                },
                summary: "Account updated.",
              }),
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        revalidatePath("/dashboard/users");
        redirect("/dashboard/users");
      } catch (error) {
        if (knownWriteError(error)) {
          throw new FormError("That email or username is already taken.");
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

    throw new FormError("Someone else changed this account. Try again.");
  });
}

export async function unlockUser(formData: FormData) {
  return formAction(async () => {
    const administrator = await requireUserManager();
    const id = idFrom(formData);
    try {
      const account = await prisma.user.update({
        where: { id },
        data: { failedSignInCount: 0, firstFailedSignInAt: null, lockedUntil: null },
      });
      await prisma.inventoryAudit.create({
        data: auditEventData({
          action: "UPDATED",
          actor: administrator,
          entity: {
            id: account.id,
            label: `${account.username} | ${account.email}`,
            type: "account",
          },
          metadata: { activityKind: "account", changes: { signInLockCleared: true } },
          summary: "Account unlocked.",
        }),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new FormError("This account no longer exists.");
      }
      throw error;
    }
    revalidatePath("/dashboard/users");
  });
}
