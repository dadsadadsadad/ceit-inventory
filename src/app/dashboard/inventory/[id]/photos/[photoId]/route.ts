import { notFound } from "next/navigation";

import { requireInventoryAccess } from "@/lib/inventory-auth";
import { isUuid } from "@/lib/ids";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Check staff access before returning the item's photo.
export async function GET(
  _request: Request,
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

  const body = new ArrayBuffer(photo.data.byteLength);
  new Uint8Array(body).set(photo.data);
  return new Response(body, {
    headers: {
      // A photo's bytes never change for its id, and it is removed by deleting the record. Let the
      // browser reuse it instead of reading the image from the database on every page view.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${photo.fileName.replaceAll('"', "")}"`,
      "Content-Type": photo.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
