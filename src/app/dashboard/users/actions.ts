"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword, passwordValidationMessage, requireAdministrator } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const roles = Object.values(UserRole);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(formData: FormData, key: string, maximumLength = 255) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  if (value.length > maximumLength) throw new Error(`${key} is too long.`);
  return value;
}

function idFrom(formData: FormData) {
  const id = requiredText(formData, "id", 64);
  if (!uuidPattern.test(id)) throw new Error("Invalid account identifier.");
  return id;
}

function emailFrom(formData: FormData) {
  const email = requiredText(formData, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function roleFrom(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  if (!roles.includes(role as UserRole)) throw new Error("Choose a valid account role.");
  return role as UserRole;
}

function passwordFrom(formData: FormData, required: boolean) {
  const password = String(formData.get("password") ?? "");
  if (!password && !required) return null;
  if (password.length > 256) throw new Error("Passwords must be 256 characters or fewer.");
  const message = passwordValidationMessage(password);
  if (message) throw new Error(message);
  return password;
}

function knownWriteError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createUser(formData: FormData) {
  await requireAdministrator();
  const password = passwordFrom(formData, true);
  if (!password) throw new Error("A password is required for a new account.");

  try {
    await prisma.user.create({
      data: {
        email: emailFrom(formData),
        passwordHash: await hashPassword(password),
        role: roleFrom(formData),
      },
    });
  } catch (error) {
    if (knownWriteError(error)) throw new Error("That email address is already assigned to an account.");
    throw error;
  }

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

export async function updateUser(formData: FormData) {
  const administrator = await requireAdministrator();
  const id = idFrom(formData);
  const role = roleFrom(formData);
  const isActive = formData.get("isActive") === "on";
  const password = passwordFrom(formData, false);
  const email = emailFrom(formData);
  const passwordHash = password ? await hashPassword(password) : null;

  if (id === administrator.id && (!isActive || role !== UserRole.ADMINISTRATOR)) {
    throw new Error("Keep your own account active and assigned as an administrator. Update another administrator first if needed.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(async (transaction) => {
        const target = await transaction.user.findUnique({ where: { id } });
        if (!target) throw new Error("This account no longer exists.");

        const removesAdministrator = target.role === UserRole.ADMINISTRATOR && target.isActive && (!isActive || role !== UserRole.ADMINISTRATOR);
        if (removesAdministrator) {
          const activeAdministratorCount = await transaction.user.count({ where: { role: UserRole.ADMINISTRATOR, isActive: true } });
          if (activeAdministratorCount <= 1) throw new Error("Keep at least one active administrator account.");
        }

        await transaction.user.update({
          where: { id },
          data: { email, role, isActive, ...(passwordHash ? { passwordHash } : {}) },
        });
        if (passwordHash || !isActive) await transaction.userSession.deleteMany({ where: { userId: id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      revalidatePath("/dashboard/users");
      redirect("/dashboard/users");
    } catch (error) {
      if (knownWriteError(error)) throw new Error("That email address is already assigned to an account.");
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("The account was updated by another request. Please try again.");
}
