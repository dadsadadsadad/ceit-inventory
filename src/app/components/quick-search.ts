"use server";

import { getCurrentInventoryUser } from "@/lib/inventory-auth";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";
import { prisma } from "@/prisma";

export type QuickSearchItem = {
  assetTag: string | null;
  id: string;
  location: string;
  name: string;
};

// Find a few equipment records for the quick navigation menu.
export async function searchInventoryQuickly(query: string): Promise<QuickSearchItem[]> {
  const user = await getCurrentInventoryUser();
  if (!user) {
    return [];
  }
  const terms = searchTerms(String(query ?? "").slice(0, 120));
  if (!terms.length || terms.join("").length < 2) {
    return [];
  }
  const items = await prisma.inventoryItem.findMany({
    where: {
      AND: everyTermMatches(terms, (term) => [
        { name: { contains: term, mode: "insensitive" as const } },
        { assetTag: { contains: term, mode: "insensitive" as const } },
        { serialNumber: { contains: term, mode: "insensitive" as const } },
        { location: { name: { contains: term, mode: "insensitive" as const } } },
        { category: { name: { contains: term, mode: "insensitive" as const } } },
      ]),
    },
    select: { id: true, name: true, assetTag: true, location: { select: { name: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 6,
  });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    assetTag: item.assetTag,
    location: item.location.name,
  }));
}
