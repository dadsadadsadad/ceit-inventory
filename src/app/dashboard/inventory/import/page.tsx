export const metadata = { title: "Import inventory · CEIT Inventory" };

import Link from "next/link";

import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";

import { ImportForm } from "./import-form";

// big files take a while
export const maxDuration = 60;

export default async function ImportInventoryPage() {
  await requireInventoryManagementPageAccess();

  return (
    <div className="page import-page">
      <div className="page-narrow space-y-6">
        <header>
          <Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">
            ← Inventory
          </Link>
          <h1 className="title mt-4 text-3xl">Import inventory data</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Import items from a CSV or Excel file.
          </p>
        </header>

        <ImportForm />
      </div>
    </div>
  );
}
