"use server";

import { AuditAction, Prisma } from "@prisma/client";

import { auditActorName } from "@/lib/audit-event";
import { FormError, formAction } from "@/lib/form-action";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { prisma } from "@/prisma";

import { requiredId } from "./shared";

const maxItemPhotos = 4;
const maxPhotoBytes = 3 * 1024 * 1024;
const supportedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function photoFileName(value: string) {
  const name = value
    .replaceAll(/[^a-zA-Z0-9._-]/g, "_")
    .replaceAll(/_+/g, "_")
    .slice(0, 120);
  return name || "item-photo";
}

// check magic bytes match the mime type
function imageTypeMatchesBytes(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    contentType === "image/webp" &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export async function uploadInventoryItemPhoto(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      throw new FormError("Choose a photo.");
    }
    if (file.size > maxPhotoBytes) {
      throw new FormError("Photos can be up to 3 MB.");
    }
    if (!supportedPhotoTypes.has(file.type)) {
      throw new FormError("Use a JPEG, PNG or WebP image.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!imageTypeMatchesBytes(file.type, bytes)) {
      throw new FormError("That file isn't a valid image.");
    }

    await prisma.$transaction(
      async (tx) => {
        const [item, photoCount] = await Promise.all([
          tx.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } }),
          tx.inventoryItemPhoto.count({ where: { inventoryItemId: itemId } }),
        ]);
        if (!item) {
          throw new FormError("This item no longer exists.");
        }
        if (photoCount >= maxItemPhotos) {
          throw new FormError(`Each item can have up to ${maxItemPhotos} photos.`);
        }
        await tx.inventoryItemPhoto.create({
          data: {
            inventoryItemId: itemId,
            fileName: photoFileName(file.name),
            contentType: file.type,
            byteSize: bytes.byteLength,
            data: Buffer.from(bytes),
          },
        });
        await tx.inventoryAudit.create({
          data: {
            itemId,
            action: AuditAction.UPDATED,
            summary: "Photo added.",
            actorId: actor.id,
            actorName: auditActorName(actor),
            metadata: {
              source: "photo-upload",
              contentType: file.type,
              byteSize: bytes.byteLength,
            },
          },
        });
        // serializable so two uploads can't both pass the photo limit
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    refreshInventoryViews(itemId);
  });
}

export async function deleteInventoryItemPhoto(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const photoId = requiredId(formData, "photoId");
    const photo = await prisma.inventoryItemPhoto.findFirst({
      where: { id: photoId, inventoryItemId: itemId },
      select: { id: true, fileName: true },
    });
    if (!photo) {
      throw new FormError("This photo no longer exists.");
    }

    await prisma.$transaction([
      prisma.inventoryItemPhoto.delete({ where: { id: photo.id } }),
      prisma.inventoryAudit.create({
        data: {
          itemId,
          action: AuditAction.UPDATED,
          summary: `Photo removed: ${photo.fileName}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { source: "photo-delete" },
        },
      }),
    ]);
    refreshInventoryViews(itemId);
  });
}
