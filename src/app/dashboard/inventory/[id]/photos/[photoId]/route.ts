import { notFound } from "next/navigation";

import { requireInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  await requireInventoryAccess();
  const { id, photoId } = await params;
  if (!uuidPattern.test(id) || !uuidPattern.test(photoId)) notFound();

  const photo = await prisma.inventoryItemPhoto.findFirst({ where: { id: photoId, inventoryItemId: id }, select: { contentType: true, data: true, fileName: true } });
  if (!photo) notFound();

  const body = new ArrayBuffer(photo.data.byteLength);
  new Uint8Array(body).set(photo.data);
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${photo.fileName.replaceAll('"', "")}"`,
      "Content-Type": photo.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
