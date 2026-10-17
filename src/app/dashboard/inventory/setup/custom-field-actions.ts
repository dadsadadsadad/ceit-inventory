"use server";

import { CustomFieldType, ItemType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auditEventData } from "@/lib/audit-event";
import { maxCustomFields, validatedChoices } from "@/lib/custom-fields";
import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";
import { runTransaction } from "@/lib/database-transaction";

function refreshPages() {
  revalidatePath("/dashboard/inventory/setup");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard/inventory/[id]", "page");
  revalidatePath("/dashboard/reports");
}

function readScope(formData: FormData) {
  const appliesTo = optionalText(formData, "appliesTo", 16);
  if (appliesTo && !Object.values(ItemType).includes(appliesTo as ItemType)) {
    throw new FormError("Pick equipment, stock or all.");
  }
  const categoryId = optionalText(formData, "categoryId", 64);
  return {
    appliesTo: (appliesTo as ItemType | null) ?? null,
    categoryId: categoryId
      ? requiredUuid(formData, "categoryId", "Choose a valid category.")
      : null,
  };
}

function readChoices(formData: FormData, type: CustomFieldType) {
  try {
    return validatedChoices(type, String(formData.get("choices") ?? ""));
  } catch (error) {
    throw new FormError(error instanceof Error ? error.message : "Check the options.");
  }
}

export async function createCustomField(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const label = requiredText(formData, "label", 60);
    const fieldType = String(formData.get("fieldType") ?? "TEXT") as CustomFieldType;
    if (!Object.values(CustomFieldType).includes(fieldType)) {
      throw new FormError("Pick a field type.");
    }
    const scope = readScope(formData);
    const choices = readChoices(formData, fieldType);

    // count + insert in one transaction so the limit holds
    await runTransaction(async (tx) => {
      const existing = await tx.customField.findMany({ select: { label: true } });
      if (existing.length >= maxCustomFields) {
        throw new FormError(`You can add up to ${maxCustomFields} extra fields.`);
      }
      if (existing.some((field) => field.label.toLowerCase() === label.toLowerCase())) {
        throw new FormError("There's already a field with that name.");
      }
      const field = await tx.customField.create({
        data: { label, fieldType, choices, ...scope, sortOrder: existing.length },
      });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: "CREATED",
          actor,
          entity: { id: field.id, label: field.label, type: "custom-field" },
          metadata: { activityKind: "configuration", fieldType },
          summary: "Extra field created.",
        }),
      });
    });
    refreshPages();
  });
}

// kind can't change once items have answers
export async function updateCustomField(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid extra field.");
    const label = requiredText(formData, "label", 60);
    const scope = readScope(formData);

    const current = await prisma.customField.findUnique({ where: { id } });
    if (!current) {
      throw new FormError("This field no longer exists.");
    }
    const choices = readChoices(formData, current.fieldType);
    const clash = await prisma.customField.findFirst({
      where: { id: { not: id }, label: { equals: label, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) {
      throw new FormError("There's already a field with that name.");
    }
    await prisma.customField.update({ where: { id }, data: { label, choices, ...scope } });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "UPDATED",
        actor,
        entity: { id, label, type: "custom-field" },
        metadata: { activityKind: "configuration" },
        summary: "Extra field updated.",
      }),
    });
    refreshPages();
  });
}

// hidden fields keep their answers
export async function setCustomFieldActive(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid extra field.");
    const isActive = formData.get("isActive") === "true";
    const field = await prisma.customField.update({ where: { id }, data: { isActive } });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "UPDATED",
        actor,
        entity: { id, label: field.label, type: "custom-field" },
        metadata: { activityKind: "configuration", isActive },
        summary: isActive ? "Extra field reactivated." : "Extra field deactivated.",
      }),
    });
    refreshPages();
  });
}

// answers stay on the items but aren't shown anymore
export async function deleteCustomField(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid extra field.");
    if (requiredText(formData, "confirmation", 16) !== "DELETE") {
      throw new FormError("Type DELETE to confirm.");
    }
    const field = await prisma.customField.delete({ where: { id } });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "DELETED",
        actor,
        entity: { id, label: field.label, type: "custom-field" },
        metadata: { activityKind: "configuration" },
        summary: "Extra field deleted.",
      }),
    });
    refreshPages();
  });
}
