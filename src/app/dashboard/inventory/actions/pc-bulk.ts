"use server";

import { AuditAction } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auditActorName } from "@/lib/audit-event";
import { FormError, formAction } from "@/lib/form-action";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { prisma } from "@/prisma";

import {
  optionalDate,
  optionalInteger,
  optionalText,
  optionalYesNo,
  requiredText,
  selectedIds,
} from "./shared";

const actions = ["install", "remove", "hardware"] as const;
type BulkAction = (typeof actions)[number];

// drop blanks so a bulk edit only changes what was filled in
function filled<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

export async function updateManyPcs(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const action = String(formData.get("bulkAction") ?? "") as BulkAction;
    if (!actions.includes(action)) {
      throw new FormError("Pick what to do.");
    }
    const itemIds = selectedIds(formData);
    const computers = await prisma.computer.findMany({
      where: { itemId: { in: itemIds } },
      select: { id: true, itemId: true },
    });
    if (!computers.length) {
      throw new FormError("None of the selected items have PC details yet.");
    }
    const actorName = auditActorName(actor);
    const audit = (summary: string, metadata: object) =>
      prisma.inventoryAudit.createMany({
        data: computers.map((pc) => ({
          itemId: pc.itemId,
          action: AuditAction.UPDATED,
          summary,
          actorId: actor.id,
          actorName,
          metadata: { ...metadata, bulk: true },
        })),
      });

    if (action === "install") {
      const name = requiredText(formData, "name", 255);
      const details = {
        version: optionalText(formData, "version", 255),
        isLicensed: optionalYesNo(formData, "isLicensed"),
        licenseExpiresAt: optionalDate(formData, "licenseExpiresAt"),
        installedAt: optionalDate(formData, "installedAt"),
      };
      // matching names count as the same program, "chrome" updates "Chrome"
      const existing = await prisma.computerSoftware.findMany({
        where: {
          computerId: { in: computers.map((pc) => pc.id) },
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true, computerId: true },
      });
      const has = new Map(existing.map((entry) => [entry.computerId, entry.id]));
      await prisma.$transaction([
        ...computers
          .filter((pc) => has.has(pc.id))
          .map((pc) =>
            prisma.computerSoftware.update({
              where: { id: has.get(pc.id) },
              data: filled(details),
            }),
          ),
        prisma.computerSoftware.createMany({
          data: computers
            .filter((pc) => !has.has(pc.id))
            .map((pc) => ({ computerId: pc.id, name, ...details })),
        }),
        audit(`Software added or updated: ${name}.`, { software: name }),
      ]);
    } else if (action === "remove") {
      const name = requiredText(formData, "removeName", 255);
      const removed = await prisma.computerSoftware.findMany({
        where: {
          computerId: { in: computers.map((pc) => pc.id) },
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (!removed.length) {
        throw new FormError(`None of the selected PCs have ${name}.`);
      }
      await prisma.$transaction([
        prisma.computerSoftware.deleteMany({
          where: { id: { in: removed.map((entry) => entry.id) } },
        }),
        audit(`Software removed: ${name}.`, { software: name }),
      ]);
    } else {
      const changes = filled({
        operatingSystem: optionalText(formData, "operatingSystem", 255),
        processor: optionalText(formData, "processor", 255),
        graphics: optionalText(formData, "graphics", 255),
        memoryGb: optionalInteger(formData, "memoryGb", 16_384),
        storageGb: optionalInteger(formData, "storageGb", 1_000_000),
        storageType: optionalText(formData, "storageType", 255),
      });
      if (!Object.keys(changes).length) {
        throw new FormError("Fill in at least one part to change.");
      }
      await prisma.$transaction([
        prisma.computer.updateMany({
          where: { id: { in: computers.map((pc) => pc.id) } },
          data: changes,
        }),
        audit("PC hardware updated.", { changes }),
      ]);
    }

    refreshInventoryViews();
    // software, hardware and pc pages
    revalidatePath("/dashboard/inventory", "layout");
  });
}
