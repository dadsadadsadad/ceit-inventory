"use server";

import { AuditAction } from "@prisma/client";
import { redirect } from "next/navigation";

import { auditActorName } from "@/lib/audit-event";
import { FormError, formAction } from "@/lib/form-action";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { canHaveComputerDetails } from "@/lib/inventory-pc";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { prisma } from "@/prisma";

import {
  computerData,
  optionalDate,
  optionalText,
  requireComputerForItem,
  requiredId,
  requiredText,
  updatedFields,
} from "./shared";

// Attach a computer profile to eligible equipment.
export async function addComputerDetails(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { computer: true },
    });
    if (item.computer || !canHaveComputerDetails(item)) {
      throw new FormError(
        "Only a PC-designated single tracked asset without an existing PC record can receive PC details.",
      );
    }

    await prisma.$transaction([
      prisma.computer.create({
        data: { itemId, ...computerData(formData), lastCheckedAt: new Date() },
      }),
      prisma.inventoryItem.update({ where: { id: itemId }, data: { lastCheckedAt: new Date() } }),
      prisma.inventoryAudit.create({
        data: {
          itemId,
          action: AuditAction.UPDATED,
          summary: "PC hardware record added.",
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { source: "manual" },
        },
      }),
    ]);

    refreshInventoryViews(itemId);
    redirect(`/dashboard/inventory/${itemId}`);
  });
}

// Save hardware and operating system changes.
export async function updateComputerDetails(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const computerId = requiredId(formData, "computerId");
    const computer = await requireComputerForItem(itemId, computerId);
    const data = computerData(formData, true);
    const changes = updatedFields(computer, data);

    await prisma.$transaction([
      prisma.computer.update({ where: { id: computer.id }, data }),
      prisma.inventoryItem.update({
        where: { id: itemId },
        data: { lastCheckedAt: data.lastCheckedAt },
      }),
      prisma.inventoryAudit.create({
        data: {
          itemId,
          action: AuditAction.UPDATED,
          summary: "PC hardware details updated.",
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { changes },
        },
      }),
    ]);

    refreshInventoryViews(itemId);
    redirect(`/dashboard/inventory/${itemId}`);
  });
}

// Add an installed application to the computer.
export async function addComputerSoftware(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const computerId = requiredId(formData, "computerId");
    await requireComputerForItem(itemId, computerId);
    const name = requiredText(formData, "name", 255);

    await prisma.$transaction([
      prisma.computerSoftware.create({
        data: {
          computerId,
          name,
          version: optionalText(formData, "version", 255),
          licenseKeyHint: optionalText(formData, "licenseKeyHint", 255),
          licenseExpiresAt: optionalDate(formData, "licenseExpiresAt"),
          installedAt: optionalDate(formData, "installedAt"),
        },
      }),
      prisma.inventoryAudit.create({
        data: {
          itemId,
          action: AuditAction.UPDATED,
          summary: `Software record added: ${name}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { software: name },
        },
      }),
    ]);

    refreshInventoryViews(itemId);
    redirect(`/dashboard/inventory/${itemId}`);
  });
}

// Save an installed application's details.
export async function updateComputerSoftware(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const computerId = requiredId(formData, "computerId");
    const id = requiredId(formData, "id");
    await requireComputerForItem(itemId, computerId);
    const software = await prisma.computerSoftware.findFirst({ where: { id, computerId } });
    if (!software) {
      throw new FormError("The software record no longer exists for this PC.");
    }
    const data = {
      name: requiredText(formData, "name", 255),
      version: optionalText(formData, "version", 255),
      licenseKeyHint: optionalText(formData, "licenseKeyHint", 255),
      licenseExpiresAt: optionalDate(formData, "licenseExpiresAt"),
      installedAt: optionalDate(formData, "installedAt"),
    };

    await prisma.$transaction([
      prisma.computerSoftware.update({ where: { id: software.id }, data }),
      prisma.inventoryAudit.create({
        data: {
          itemId,
          action: AuditAction.UPDATED,
          summary: `Software record updated: ${data.name}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { changes: updatedFields(software, data) },
        },
      }),
    ]);

    refreshInventoryViews(itemId);
    redirect(`/dashboard/inventory/${itemId}`);
  });
}

// Remove an installed application from the record.
export async function removeComputerSoftware(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const computerId = requiredId(formData, "computerId");
    const id = requiredId(formData, "id");
    await requireComputerForItem(itemId, computerId);
    const software = await prisma.computerSoftware.findFirst({ where: { id, computerId } });
    if (!software) {
      throw new FormError("The software record no longer exists for this PC.");
    }

    await prisma.$transaction([
      prisma.computerSoftware.delete({ where: { id: software.id } }),
      prisma.inventoryAudit.create({
        data: {
          itemId,
          action: AuditAction.UPDATED,
          summary: `Software record removed: ${software.name}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { software: software.name },
        },
      }),
    ]);

    refreshInventoryViews(itemId);
    redirect(`/dashboard/inventory/${itemId}`);
  });
}
