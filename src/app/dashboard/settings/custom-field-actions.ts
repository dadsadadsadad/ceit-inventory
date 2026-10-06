"use server";

import { CustomFieldType, ItemType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auditEventData } from "@/lib/audit-event";
import { maximumCustomFields, parseChoices } from "@/lib/custom-fields";
import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

function refreshPages() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/inventory/new");
  revalidatePath("/dashboard/inventory/[id]", "page");
  revalidatePath("/dashboard/reports");
}

function readScope(formData: FormData) {
  const appliesTo = optionalText(formData, "appliesTo", 16);
  if (appliesTo && !Object.values(ItemType).includes(appliesTo as ItemType)) {
    throw new FormError("Choose equipment, stock, or everything.");
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
  if (type !== CustomFieldType.CHOICE) {
    return [];
  }
  const choices = parseChoices(String(formData.get("choices") ?? ""));
  if (choices.length < 2) {
    throw new FormError("Give at least two answers to choose from, one per line.");
  }
  if (choices.some((choice) => choice.length > 80)) {
    throw new FormError("Each answer must be 80 characters or fewer.");
  }
  return choices;
}

// Add an extra detail staff can record on items.
export async function createCustomField(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const label = requiredText(formData, "label", 60);
    const fieldType = String(formData.get("fieldType") ?? "TEXT") as CustomFieldType;
    if (!Object.values(CustomFieldType).includes(fieldType)) {
      throw new FormError("Choose what kind of answer this field takes.");
    }
    const scope = readScope(formData);
    const choices = readChoices(formData, fieldType);

    const existing = await prisma.customField.findMany({ select: { label: true } });
    if (existing.length >= maximumCustomFields) {
      throw new FormError(`You can add up to ${maximumCustomFields} extra fields.`);
    }
    if (existing.some((field) => field.label.toLowerCase() === label.toLowerCase())) {
      throw new FormError("There is already an extra field with that name.");
    }

    const field = await prisma.customField.create({
      data: { label, fieldType, choices, ...scope, sortOrder: existing.length },
    });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "CREATED",
        actor,
        entity: { id: field.id, label: field.label, type: "custom-field" },
        metadata: { activityKind: "configuration", fieldType },
        summary: "Extra field created.",
      }),
    });
    refreshPages();
  });
}

// Rename a field or change who it applies to. The kind of answer cannot change once records use it.
export async function updateCustomField(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid extra field.");
    const label = requiredText(formData, "label", 60);
    const scope = readScope(formData);

    const current = await prisma.customField.findUnique({ where: { id } });
    if (!current) {
      throw new FormError("This extra field no longer exists.");
    }
    const choices = readChoices(formData, current.fieldType);
    const clash = await prisma.customField.findFirst({
      where: { id: { not: id }, label: { equals: label, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) {
      throw new FormError("There is already an extra field with that name.");
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

// Hide a field from forms without losing what was recorded.
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

// Remove a field. Answers already recorded on items are no longer shown.
export async function deleteCustomField(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid extra field.");
    if (requiredText(formData, "confirmation", 16) !== "DELETE") {
      throw new FormError("Type DELETE to remove this extra field.");
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
