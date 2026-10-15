import { notFound } from "next/navigation";
import sharp from "sharp";

import { requireInventoryAccess } from "@/lib/inventory-auth";
import { isUuid } from "@/lib/ids";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const thumbSize = 160;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  await requireInventoryAccess();
  const { id, photoId } = await params;
  if (!isUuid(id) || !isUuid(photoId)) {
    notFound();
  }

  const photo = await prisma.inventoryItemPhoto.findFirst({
    where: { id: photoId, inventoryItemId: id },
    select: { contentType: true, data: true, fileName: true },
  });
  if (!photo) {
    notFound();
  }

  const headers = {
    // photos never change for an id, so let the browser cache them
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${photo.fileName.replaceAll('"', "")}"`,
    "Content-Type": photo.contentType,
    "X-Content-Type-Options": "nosniff",
  };

  // small version for the inventory list, falls back to the original if resizing fails
  if (new URL(request.url).searchParams.get("size") === "thumb") {
    try {
      const thumb = await sharp(photo.data)
        .rotate()
        .resize(thumbSize, thumbSize, { fit: "cover" })
        .webp({ quality: 75 })
        .toBuffer();
      return new Response(new Uint8Array(thumb), {
        headers: {
          ...headers,
          "Cache-Control": "private, max-age=86400",
          "Content-Type": "image/webp",
        },
      });
    } catch {}
  }

  const body = new ArrayBuffer(photo.data.byteLength);
  new Uint8Array(body).set(photo.data);
  return new Response(body, { headers });
}
