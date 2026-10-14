import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentInventoryUser } from "@/lib/inventory-auth";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

const resultLimit = 10;

// item search for the picker
export async function GET(request: Request) {
  if (!(await getCurrentInventoryUser())) {
    return new NextResponse(null, { status: 401 });
  }
  const terms = searchTerms(new URL(request.url).searchParams.get("q")?.slice(0, 120));
  const headers = { "Cache-Control": "private, no-store" };
  if (!terms.length) {
    return NextResponse.json({ items: [] }, { headers });
  }
  const items = await prisma.inventoryItem.findMany({
    where: {
      AND: [
        { status: { not: "RETIRED" } },
        ...everyTermMatches<Prisma.InventoryItemWhereInput>(terms, (term) => [
          { name: { contains: term, mode: "insensitive" } },
          { assetTag: { contains: term, mode: "insensitive" } },
          { serialNumber: { contains: term, mode: "insensitive" } },
          { location: { is: { name: { contains: term, mode: "insensitive" } } } },
        ]),
      ],
    },
    select: { id: true, name: true, assetTag: true, location: { select: { name: true } } },
    orderBy: [{ name: "asc" }, { assetTag: "asc" }],
    take: resultLimit,
  });
  return NextResponse.json(
    {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        assetTag: item.assetTag,
        location: item.location.name,
      })),
    },
    { headers },
  );
}
