"use client";

import { useActionState } from "react";

import { importInventory, type ImportResult } from "./actions";

const initialImportResult: ImportResult = { errors: [], imported: 0, previewed: false, skipped: 0 };

export function ImportForm() {
  const [result, action, pending] = useActionState(importInventory, initialImportResult);

  return (
    <form action={action} className="card space-y-5 rounded-lg p-5 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Choose a spreadsheet</h2>
          <p className="muted mt-1 text-sm leading-6">Use the template for a new file, or upload an existing inventory export directly.</p>
        </div>
        <a href="/inventory-import-template.csv" download className="card-muted rounded-lg px-3 py-2 text-center text-sm font-semibold accent-link">
          Download CSV template
        </a>
      </div>

      <label className="block">
        <span className="text-sm font-semibold">CSV or Excel file</span>
        <input
          required
          name="file"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="field mt-2 block w-full rounded-lg px-3 py-2.5 text-sm"
        />
      </label>

      <fieldset className="card-muted space-y-3 rounded-lg p-4">
        <legend className="text-sm font-semibold">Default location for files without a location column</legend>
        <p className="muted text-xs leading-5">
          Leave this blank only when every row already has a <code>location</code> or <code>room</code>. Your CEIT PROPERTY workbook
          needs a value here because it does not list rooms per item.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Location name</span>
            <input name="defaultLocation" className="field mt-1 w-full rounded-lg px-3 py-2" placeholder="e.g. CEIT Property Room" maxLength={160} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Room number <span className="muted">(optional)</span></span>
            <input name="defaultRoomNumber" className="field mt-1 w-full rounded-lg px-3 py-2" placeholder="e.g. 405" maxLength={80} />
          </label>
        </div>
      </fieldset>

      <label className="flex items-start gap-3 text-sm leading-5">
        <input name="createMissingSetup" type="checkbox" defaultChecked className="mt-0.5 h-4 w-4" />
        <span>
          <strong>Create missing categories and locations.</strong>
          <span className="muted block">Leave this checked for a first import. Uncheck it to catch spelling mistakes against your existing Settings data.</span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm leading-5">
        <input name="previewOnly" type="checkbox" className="mt-0.5 h-4 w-4" />
        <span>
          <strong>Validate before importing.</strong>
          <span className="muted block">Checks every row&apos;s format and repeated identifiers without saving anything. Uncheck it when the preview is clean to import.</span>
        </span>
      </label>

      <div className="card-muted rounded-lg p-4 text-sm leading-6">
        <p>
          Required data: <code>name</code>/<code>item name</code>, <code>category</code>/<code>classification</code>, and a location
          column or the default location above.
        </p>
        <p className="muted mt-2">
          Headers may appear within the first 25 rows. The importer also recognizes legacy <code>inventory code</code>, <code>product info</code>,
          <code>checked</code>, and <code>last date checked</code> columns. Header spaces, underscores, and capitalization are accepted.
        </p>
        <p className="muted mt-2">
          A legacy <code>checked</code> value is preserved as the inventory status: <code>OK</code>, <code>WORKING</code>, <code>DEPLOYED</code>,
          <code>DEFECTIVE</code>, or <code>NOT TESTED</code>.
        </p>
      </div>

      <p className="muted text-sm">
        Imports accept up to 1,000 rows and 10 MB per file. Each row is saved atomically; duplicate identifiers or invalid rows are
        skipped with a helpful row-level message.
      </p>

      <button disabled={pending} className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60">
        {pending ? "Checking file…" : "Validate or import inventory"}
      </button>

      {result.imported || result.skipped ? (
        <div className="notice rounded-lg px-4 py-3 text-sm" aria-live="polite">
          <strong>{result.imported} {result.previewed ? "valid row" : "imported"}{result.previewed && result.imported !== 1 ? "s" : ""}</strong>
          {result.previewed ? " · no records were saved" : ""}
          {result.skipped ? ` · ${result.skipped} skipped` : ""}
        </div>
      ) : null}

      {result.errors.length ? (
        <ul className="notice list-disc space-y-1 rounded-lg px-8 py-4 text-sm" aria-live="polite">
          {result.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}
    </form>
  );
}
