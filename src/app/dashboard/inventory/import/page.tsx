export const metadata = { title: "Import inventory · CEIT Inventory" };

import Link from "next/link";

import { requireInventoryManagementPageAccess } from "@/lib/inventory-auth";

import { ImportForm } from "./import-form";

// A large file is read and saved row by row, so give the import room to finish.
export const maxDuration = 60;

// Staff page for spreadsheet imports.
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
            Upload a CSV or Excel spreadsheet in whatever shape you have it. Missing or extra
            columns, empty rows, and untidy values are handled, and rows that cannot be imported are
            listed with the reason instead of failing the whole file. Equipment gets its own asset
            tag and QR code; stock is kept as one counted record.
          </p>
        </header>

        {/* Spreadsheet upload and validation results. */}
        <ImportForm />
      </div>
    </div>
  );
}
