import Link from "next/link";

import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";

import { ImportForm } from "./import-form";

export default async function ImportInventoryPage() {
  await requireInventoryManagementPageAccess();

  return (
    <div className="page import-page">
      <div className="page-narrow space-y-6">
        <header>
          <Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">
            ← Inventory
          </Link>
          <p className="eyebrow mt-5">Bulk import</p>
          <h1 className="title mt-3 text-3xl">Import inventory data</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Upload an existing CSV or Excel spreadsheet. Every valid equipment row becomes one individually tagged inventory record with its own QR code; use supply rows for quantity-based stock. The import reports rows that need correction instead of failing the entire file.
          </p>
        </header>

        <ImportForm />
      </div>
    </div>
  );
}
