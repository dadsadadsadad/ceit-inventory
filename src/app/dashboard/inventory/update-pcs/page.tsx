export const metadata = { title: "Update many PCs · CEIT Inventory" };

import Link from "next/link";
import { ItemStatus } from "@prisma/client";

import { loadHardwareSuggestions } from "@/lib/computer-queries";
import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

import { PcBulkForm, type BulkRoom } from "./pc-bulk-form";

export const dynamic = "force-dynamic";

export default async function UpdatePcsPage() {
  await requireInventoryManagementPageAccess();
  const [computers, suggestions] = await Promise.all([
    prisma.computer.findMany({
      where: { item: { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } } },
      select: {
        software: { select: { name: true }, orderBy: { name: "asc" } },
        item: {
          select: {
            id: true,
            name: true,
            assetTag: true,
            location: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ item: { location: { name: "asc" } } }, { item: { name: "asc" } }],
    }),
    loadHardwareSuggestions(),
  ]);

  const rooms = new Map<string, BulkRoom>();
  for (const pc of computers) {
    const { location } = pc.item;
    const room = rooms.get(location.id) ?? { id: location.id, name: location.name, pcs: [] };
    room.pcs.push({
      id: pc.item.id,
      name: pc.item.name,
      assetTag: pc.item.assetTag,
      software: pc.software.map((entry) => entry.name),
    });
    rooms.set(location.id, room);
  }
  const softwareNames = [
    ...new Set(computers.flatMap((pc) => pc.software.map((entry) => entry.name))),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="page">
      <div className="page-narrow space-y-6">
        <header>
          <Link href="/dashboard/inventory/software" className="accent-link text-sm font-semibold">
            ← Software
          </Link>
          <p className="eyebrow mt-5">PCs</p>
          <h1 className="title mt-3 text-3xl">Update many PCs</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Add, update or remove software, or change hardware, on a whole room or the PCs you pick.
          </p>
        </header>
        {rooms.size ? (
          <PcBulkForm
            rooms={[...rooms.values()]}
            softwareNames={softwareNames}
            suggestions={suggestions}
          />
        ) : (
          <p className="notice rounded-lg px-5 py-4 text-sm">
            No PCs have PC details yet. Open a PC in the inventory and add its details first.
          </p>
        )}
      </div>
    </div>
  );
}
