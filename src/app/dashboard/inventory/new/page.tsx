import Link from "next/link";

import { NewInventoryForm } from "./new-inventory-form";
import { prisma } from "@/prisma";
import { requireWriteAccess } from "@/lib/inventory-auth";

export const dynamic = "force-dynamic";

export default async function NewInventoryItemPage() {
  await requireWriteAccess();
  const [categories, locations] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const ready = categories.length > 0 && locations.length > 0;

  return (
    <div className="page"><div className="page-narrow space-y-6">
      <header><Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">Back to inventory</Link><p className="eyebrow mt-5">New record</p><h1 className="title mt-3 text-3xl">Add inventory item</h1><p className="muted mt-2 text-sm leading-6">Create a tracked asset, supply record, or PC with complete technical and lifecycle details.</p></header>
      {!ready ? <div className="notice rounded-lg px-5 py-4 text-sm">Add at least one active category and location in Settings before creating inventory records.</div> : <NewInventoryForm categories={categories} locations={locations} />}
    </div></div>
  );
}
