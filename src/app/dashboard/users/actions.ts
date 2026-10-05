"use server";

import { FormError, formAction } from "@/lib/form-action";
import { requiredText, requiredUuid } from "@/lib/form-fields";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auditEventData } from "@/lib/audit-event";
import {
  hashPassword,
  passwordValidationMessage,
  requireAdministrator,
} from "@/lib/inventory-auth";
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
    throw new FormError(
      "Use 3–32 letters, numbers, periods, underscores, or hyphens for the username.",
    );
  }
  return username;
}

function roleFrom(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  if (!roles.includes(role as UserRole)) {
    throw new FormError("Choose a valid account role.");
  }
  return role as UserRole;
}

// Validate a new password when one is supplied.
function passwordFrom(formData: FormData, required: boolean) {
  const password = String(formData.get("password") ?? "");
  if (!password && !required) {
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

function knownWriteError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Staff account management.
export async function createUser(formData: FormData) {
  return formAction(async () => {
    const administrator = await requireAdministrator();
    const password = passwordFrom(formData, true);
    if (!password) {
      throw new FormError("A password is required for a new account.");
    }
    const email = emailFrom(formData);
    const username = usernameFrom(formData);
    const role = roleFrom(formData);

    try {
      await prisma.$transaction(async (transaction) => {
        const account = await transaction.user.create({
          data: { email, username, passwordHash: await hashPassword(password), role },
        });
        await transaction.inventoryAudit.create({
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
        throw new FormError("That email address or username is already assigned to an account.");
      }
      throw error;
    }

    revalidatePath("/dashboard/users");
    redirect("/dashboard/users");
  });
}

// Save account changes and protect the last administrator.
export async function updateUser(formData: FormData) {
  return formAction(async () => {
    const administrator = await requireAdministrator();
    const id = idFrom(formData);
    const role = roleFrom(formData);
    const isActive = formData.get("isActive") === "on";
    const password = passwordFrom(formData, false);
    const email = emailFrom(formData);
    const username = usernameFrom(formData);
    const passwordHash = password ? await hashPassword(password) : null;

    if (id === administrator.id && (!isActive || role !== UserRole.ADMINISTRATOR)) {
      throw new FormError(
        "Keep your own account active and assigned as an administrator. Update another administrator first if needed.",
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (transaction) => {
            const target = await transaction.user.findUnique({ where: { id } });
            if (!target) {
              throw new FormError("This account no longer exists.");
            }

            const removesAdministrator =
              target.role === UserRole.ADMINISTRATOR &&
              target.isActive &&
              (!isActive || role !== UserRole.ADMINISTRATOR);
            if (removesAdministrator) {
              const activeAdministratorCount = await transaction.user.count({
                where: { role: UserRole.ADMINISTRATOR, isActive: true },
              });
              if (activeAdministratorCount <= 1) {
                throw new FormError("Keep at least one active administrator account.");
              }
            }

            const account = await transaction.user.update({
              where: { id },
              data: {
                email,
                username,
                role,
                isActive,
                // A reset is how an administrator helps someone who is locked out.
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
              await transaction.userSession.deleteMany({ where: { userId: id } });
            }
            await transaction.inventoryAudit.create({
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
          throw new FormError("That email address or username is already assigned to an account.");
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

    throw new FormError("The account was updated by another request. Please try again.");
  });
}

// Let an administrator end a temporary sign-in lock without changing the password.
export async function unlockUser(formData: FormData) {
  return formAction(async () => {
    const administrator = await requireAdministrator();
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
          summary: "Account sign-in lock cleared.",
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
