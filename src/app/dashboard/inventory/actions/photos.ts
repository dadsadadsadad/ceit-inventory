"use server";

import { AuditAction, Prisma } from "@prisma/client";

import { auditActorName } from "@/lib/audit-event";
import { FormError, formAction } from "@/lib/form-action";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { prisma } from "@/prisma";

import { requiredId } from "./shared";

const maximumItemPhotos = 4;
const maximumPhotoBytes = 3 * 1024 * 1024;
const supportedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

// Photo validation and uploads.
function photoFileName(value: string) {
  const name = value
    .replaceAll(/[^a-zA-Z0-9._-]/g, "_")
    .replaceAll(/_+/g, "_")
    .slice(0, 120);
  return name || "item-photo";
}

// Check the file contents against its image type.
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

// Validate and attach an item photo.
export async function uploadInventoryItemPhoto(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const itemId = requiredId(formData, "itemId");
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      throw new FormError("Choose an image to upload.");
    }
    if (file.size > maximumPhotoBytes) {
      throw new FormError("Each photo must be 3 MB or smaller.");
    }
    if (!supportedPhotoTypes.has(file.type)) {
      throw new FormError("Use a JPEG, PNG, or WebP image.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!imageTypeMatchesBytes(file.type, bytes)) {
      throw new FormError("The image file does not match its declared type.");
    }

    await prisma.$transaction(
      async (transaction) => {
        const [item, photoCount] = await Promise.all([
          transaction.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } }),
          transaction.inventoryItemPhoto.count({ where: { inventoryItemId: itemId } }),
        ]);
        if (!item) {
          throw new FormError("This inventory item no longer exists.");
        }
        if (photoCount >= maximumItemPhotos) {
          throw new FormError(`Each item can have up to ${maximumItemPhotos} photos.`);
        }
        await transaction.inventoryItemPhoto.create({
          data: {
            inventoryItemId: itemId,
            fileName: photoFileName(file.name),
            contentType: file.type,
            byteSize: bytes.byteLength,
            data: Buffer.from(bytes),
          },
        });
        await transaction.inventoryAudit.create({
          data: {
            itemId,
            action: AuditAction.UPDATED,
            summary: "Item photo added.",
            actorId: actor.id,
            actorName: auditActorName(actor),
            metadata: {
              source: "photo-upload",
              contentType: file.type,
              byteSize: bytes.byteLength,
            },
          },
        });
        // Serializable, so two uploads at once cannot both slip under the photo limit.
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    refreshInventoryViews(itemId);
  });
}

// Remove the selected photo from this item.
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
      throw new FormError("This photo no longer belongs to the item.");
    }

    await prisma.$transaction([
      prisma.inventoryItemPhoto.delete({ where: { id: photo.id } }),
      prisma.inventoryAudit.create({
        data: {
          itemId,
          action: AuditAction.UPDATED,
          summary: `Item photo removed: ${photo.fileName}.`,
          actorId: actor.id,
          actorName: auditActorName(actor),
          metadata: { source: "photo-delete" },
        },
      }),
    ]);
    refreshInventoryViews(itemId);
  });
}
