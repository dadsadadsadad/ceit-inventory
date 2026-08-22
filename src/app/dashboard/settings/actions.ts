"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/prisma";
import { requireAdministrator } from "@/lib/inventory-auth";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function refreshSetupPages() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard/inventory");
}

export async function createCategory(formData: FormData) {
  await requireAdministrator();
  await prisma.category.create({ data: { name: requiredText(formData, "name"), description: optionalText(formData, "description", 2_000) } });
  refreshSetupPages();
}

export async function updateCategory(formData: FormData) {
  await requireAdministrator();
  await prisma.category.update({ where: { id: requiredId(formData) }, data: { name: requiredText(formData, "name"), description: optionalText(formData, "description", 2_000) } });
  refreshSetupPages();
}

export async function createLocation(formData: FormData) {
  await requireAdministrator();
  await prisma.location.create({
    data: {
      name: requiredText(formData, "name"),
      roomNumber: optionalText(formData, "roomNumber", 100),
      description: optionalText(formData, "description", 2_000),
    },
  });
  refreshSetupPages();
}

export async function updateLocation(formData: FormData) {
  await requireAdministrator();
  await prisma.location.update({
    where: { id: requiredId(formData) },
    data: {
      name: requiredText(formData, "name"),
      roomNumber: optionalText(formData, "roomNumber", 100),
      description: optionalText(formData, "description", 2_000),
    },
  });
  refreshSetupPages();
}

export async function setCategoryActive(formData: FormData) {
  await requireAdministrator();
  await prisma.category.update({ where: { id: requiredId(formData) }, data: { isActive: String(formData.get("isActive")) === "true" } });
  refreshSetupPages();
}

export async function setLocationActive(formData: FormData) {
  await requireAdministrator();
  await prisma.location.update({ where: { id: requiredId(formData) }, data: { isActive: String(formData.get("isActive")) === "true" } });
  refreshSetupPages();
}

export async function deleteLocation(formData: FormData) {
  await requireAdministrator();
  const id = requiredId(formData);
  const confirmation = requiredText(formData, "confirmation", 16);
  if (confirmation !== "DELETE") throw new Error("Type DELETE to permanently remove this location.");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(async (transaction) => {
        const location = await transaction.location.findUnique({
          where: { id },
          select: { _count: { select: { items: true } } },
        });

        if (!location) throw new Error("This location no longer exists.");
        if (location._count.items > 0) {
          throw new Error(`Move or remove the ${location._count.items} inventory record${location._count.items === 1 ? "" : "s"} assigned to this location before deleting it.`);
        }

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
