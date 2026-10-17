"use server";

import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/prisma";
import { auditEventData } from "@/lib/audit-event";
import { normalizeTagCode, suggestTagCode, tagCodeLength } from "@/lib/asset-tag-code";
import { requireWriteAccess } from "@/lib/inventory-auth";

function requiredId(formData: FormData) {
  return requiredUuid(formData, "id", "Invalid setup record.");
}

function optionalAssetTagCode(formData: FormData) {
  const value = optionalText(formData, "assetTagCode", 20);
  if (!value) {
    return null;
  }
  const code = normalizeTagCode(value);
  if (!code) {
    throw new FormError(
      `Tag codes use ${tagCodeLength.min} to ${tagCodeLength.max} letters or numbers.`,
    );
  }
  return code;
}

// keep the current code or pick an unused one
async function categoryAssetTagCode(formData: FormData, name: string, currentId?: string) {
  const supplied = optionalAssetTagCode(formData);
  if (supplied) {
    return supplied;
  }
  const codes = await prisma.category.findMany({
    where: currentId ? { id: { not: currentId } } : undefined,
    select: { assetTagCode: true },
  });
  return suggestTagCode(
    name,
    codes.map((category) => category.assetTagCode),
  );
}

// keep the current code or pick an unused one
async function locationAssetTagCode(formData: FormData, name: string, currentId?: string) {
  const supplied = optionalAssetTagCode(formData);
  if (supplied) {
    return supplied;
  }
  const codes = await prisma.location.findMany({
    where: currentId ? { id: { not: currentId } } : undefined,
    select: { assetTagCode: true },
  });
  return suggestTagCode(
    name,
    codes.map((location) => location.assetTagCode),
  );
}

function refreshSetupPages() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory/setup");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard/inventory");
}

function setupWriteError(error: unknown, label: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new FormError(`A ${label.toLowerCase()} with that name or code already exists.`);
  }
  return error;
}

// categories and rooms
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

export async function createLocation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    try {
      const location = await prisma.location.create({
        data: {
          name: requiredText(formData, "name"),
          assetTagCode: await locationAssetTagCode(formData, requiredText(formData, "name")),
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

export async function updateLocation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData);
    try {
      const location = await prisma.location.update({
        where: { id },
        data: {
          name: requiredText(formData, "name"),
          assetTagCode: await locationAssetTagCode(formData, requiredText(formData, "name"), id),
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

export async function deleteCategory(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData);
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "DELETE") {
      throw new FormError("Type DELETE to confirm.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const category = await tx.category.findUnique({
              where: { id },
              select: { _count: { select: { items: true } }, id: true, name: true },
            });

            if (!category) {
              throw new FormError("This category no longer exists.");
            }
            if (category._count.items > 0) {
              throw new FormError(
                `Reassign or remove the ${category._count.items} inventory record${category._count.items === 1 ? "" : "s"} in this category first, or deactivate it.`,
              );
            }

            await tx.inventoryAudit.create({
              data: auditEventData({
                action: "DELETED",
                actor,
                entity: { id: category.id, label: category.name, type: "category" },
                metadata: { activityKind: "configuration" },
                summary: "Category permanently deleted.",
              }),
            });
            await tx.category.delete({ where: { id } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        refreshSetupPages();
        return;
      } catch (error) {
        // P2003 = an item got assigned in the meantime (foreign key)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new FormError("An item was just added to this category, so it can't be deleted.");
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

    throw new FormError("Someone else changed this category. Try again.");
  });
}

export async function deleteLocation(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredId(formData);
    const confirmation = requiredText(formData, "confirmation", 16);
    if (confirmation !== "DELETE") {
      throw new FormError("Type DELETE to confirm.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const location = await tx.location.findUnique({
              where: { id },
              select: { _count: { select: { items: true } }, id: true, name: true },
            });

            if (!location) {
              throw new FormError("This location no longer exists.");
            }
            if (location._count.items > 0) {
              throw new FormError(
                `Move or remove the ${location._count.items} inventory record${location._count.items === 1 ? "" : "s"} in this location first.`,
              );
            }

            await tx.inventoryAudit.create({
              data: auditEventData({
                action: "DELETED",
                actor,
                entity: { id: location.id, label: location.name, type: "location" },
                metadata: { activityKind: "configuration" },
                summary: "Location permanently deleted.",
              }),
            });
            await tx.location.delete({ where: { id } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        refreshSetupPages();
        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new FormError("An item was just added to this location, so it can't be deleted.");
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

    throw new FormError("Someone else changed this location. Try again.");
  });
}
