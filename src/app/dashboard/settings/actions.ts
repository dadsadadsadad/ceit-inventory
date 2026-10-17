"use server";

import { FormError, formAction } from "@/lib/form-action";
import { requiredText } from "@/lib/form-fields";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/prisma";
import { auditEventData } from "@/lib/audit-event";
import {
  clearSession,
  hashPassword,
  passwordValidationMessage,
  requireInventoryAccess,
  verifyPassword,
} from "@/lib/inventory-auth";
import { isAccountLocked, recordFailedPassword } from "@/lib/account-lock";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9._-]{3,32}$/;

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
    throw new FormError("Usernames are 3-32 letters, numbers, . _ or -");
  }
  return username;
}

function currentPassword(formData: FormData) {
  const password = String(formData.get("currentPassword") ?? "");
  if (password.length > 256) {
    throw new FormError("Password is too long.");
  }
  return password;
}

function newPassword(formData: FormData) {
  const password = String(formData.get("newPassword") ?? "");
  if (!password) {
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

function accountWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new FormError("That email or username is already taken.");
  }
  return error;
}

// account
export async function updateOwnAccount(formData: FormData) {
  return formAction(async () => {
    const actor = await requireInventoryAccess();
    const email = accountEmail(formData);
    const username = accountUsername(formData);
    const password = newPassword(formData);
    const confirmation = String(formData.get("confirmPassword") ?? "");
    const current = currentPassword(formData);

    if (!password && confirmation) {
      throw new FormError("Enter the new password first.");
    }
    if (password && password !== confirmation) {
      throw new FormError("Passwords don't match.");
    }

    const account = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { email: true, lockedUntil: true, passwordHash: true, username: true },
    });
    if (!account) {
      throw new FormError("Your account no longer exists.");
    }

    const identityChanged = account.email !== email || account.username !== username;
    if (!identityChanged && !password) {
      throw new FormError("Nothing to save.");
    }
    if (!current) {
      throw new FormError("Enter your current password.");
    }
    // wrong passwords here count toward the sign-in lock too
    if (isAccountLocked(account)) {
      throw new FormError("Too many wrong passwords. Try again in 15 minutes.");
    }
    if (!(await verifyPassword(current, account.passwordHash))) {
      await recordFailedPassword(actor.id);
      throw new FormError("Wrong current password.");
    }

    try {
      await prisma.$transaction(
        async (tx) => {
          const updatedAccount = await tx.user.update({
            where: { id: actor.id },
            data: {
              email,
              username,
              ...(password ? { passwordHash: await hashPassword(password) } : {}),
            },
          });
          if (password) {
            await tx.userSession.deleteMany({ where: { userId: actor.id } });
          }
          await tx.inventoryAudit.create({
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
              summary: "Account settings updated.",
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
