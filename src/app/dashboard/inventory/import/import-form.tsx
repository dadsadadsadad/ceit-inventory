"use client";

import { useActionState, useRef, useState } from "react";

import { FormSection } from "@/app/components/form-section";

import { importInventory, type ImportResult } from "./actions";

const initialImportResult: ImportResult = {
  errors: [],
  imported: 0,
  matched: [],
  notices: [],
  previewed: false,
  records: 0,
  skipped: 0,
  warnings: [],
};

function rowsText(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "row" : "rows"}`;
}

export function ImportForm() {
  const preserveFields = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [intent, setIntent] = useState<"check" | "import">("check");
  const [result, action, pending] = useActionState(
    async (previous: ImportResult, data: FormData) => {
      try {
        const next = await importInventory(previous, data);
        preserveFields.current = next.previewed || next.imported === 0;
        if (!preserveFields.current) {
          formRef.current?.removeAttribute("data-dirty");
        }
        window.dispatchEvent(
          new CustomEvent("ceit:mutation", {
            detail: { success: next.imported > 0 && !next.previewed },
          }),
        );
        return next;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "digest" in error &&
          String(error.digest).startsWith("NEXT_REDIRECT")
        ) {
          throw error;
        }
        preserveFields.current = true;
        return {
          ...initialImportResult,
          errors: [
            "The import didn't finish. Check the file again to see what was already imported.",
          ],
        };
      }
    },
    initialImportResult,
  );
  const hasResult = result.imported > 0 || result.skipped > 0 || result.errors.length > 0;

  return (
    <form
      ref={formRef}
      action={action}
      data-saving={pending || undefined}
      aria-busy={pending || undefined}
      onChange={() => formRef.current?.setAttribute("data-dirty", "true")}
      onReset={(event) => {
        if (preserveFields.current) {
          event.preventDefault();
        }
      }}
      className="card space-y-5 rounded-lg p-5 sm:p-7"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Choose a spreadsheet</h2>
          <p className="muted mt-1 text-sm leading-6">
            Use your own file or the template. Only the item name is required.
          </p>
        </div>
        <a
          href="/inventory-import-template.csv"
          download
          className="secondary-button shrink-0 rounded-lg px-3 py-2 text-center text-sm font-semibold"
        >
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

      <FormSection
        title="Defaults for missing details"
        hint="Used when a row has no category or location"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium">Category</span>
            <input
              name="defaultCategory"
              className="field mt-1 w-full rounded-lg px-3 py-2"
              placeholder="e.g. Computer Equipment"
              maxLength={120}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Location</span>
            <input
              name="defaultLocation"
              className="field mt-1 w-full rounded-lg px-3 py-2"
              placeholder="e.g. CEIT Property Room"
              maxLength={160}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Room number</span>
            <input
              name="defaultRoomNumber"
              className="field mt-1 w-full rounded-lg px-3 py-2"
              placeholder="e.g. 405"
              maxLength={80}
            />
          </label>
        </div>
        <p className="muted mt-3 text-xs leading-5">
          If left empty, rows go under &quot;Uncategorized&quot; and &quot;Unassigned&quot;.
        </p>
      </FormSection>

      <div className="space-y-3">
        <label className="flex items-start gap-3 text-sm leading-5">
          <input
            name="createMissingSetup"
            type="checkbox"
            defaultChecked
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <strong>Create missing categories and locations</strong>
            <span className="muted block">
              Turn off to catch typos in category and location names.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm leading-5">
          <input
            name="keepExtraColumns"
            type="checkbox"
            defaultChecked
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <strong>Put other columns in notes</strong>
            <span className="muted block">Columns that match an extra field fill that field.</span>
          </span>
        </label>
      </div>

      <details className="form-section">
        <summary className="form-section-summary">
          <span className="form-section-title">How the file is read</span>
        </summary>
        <div className="form-section-body space-y-2 text-sm leading-6">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Headings</strong> can be in any order. These names also work:{" "}
              <code>Item</code>, <code>Equipment</code>, <code>Qty</code>, <code>Serial No.</code>,{" "}
              <code>Brand</code>, <code>Room</code>, <code>Price</code>, <code>Warranty</code>.
            </li>
            <li>
              <strong>Missing columns</strong> are fine. <strong>Empty rows</strong>, totals and
              repeated headers are skipped.
            </li>
            <li>
              <strong>Rows with a problem</strong> are skipped and listed. The rest still import.
            </li>
            <li>
              <strong>Messy values</strong> like &quot;₱1,200&quot;, &quot;8GB&quot;,
              &quot;1/15/2026&quot; or &quot;broken&quot; work. Anything unreadable is left blank.
            </li>
            <li>
              <strong>Equipment</strong> with a quantity over 1 becomes that many items, each with
              its own tag. Put <code>stock</code> in a <code>type</code> column to keep it as one
              stock record.
            </li>
            <li>Max 1,000 rows and 10 MB. Check the file first, then import.</li>
          </ul>
        </div>
      </details>

      <div className="flex flex-wrap gap-3">
        <button
          name="intent"
          value="check"
          disabled={pending}
          onClick={() => setIntent("check")}
          className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          {pending && intent === "check" ? "Checking file..." : "Check file"}
        </button>
        <button
          name="intent"
          value="import"
          disabled={pending}
          onClick={() => setIntent("import")}
          className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          {pending && intent === "import" ? "Importing..." : "Import"}
        </button>
      </div>

      {hasResult ? (
        <div
          className={`notice ${result.imported && !result.errors.length ? "notice-success" : ""} rounded-lg px-4 py-3 text-sm`}
          aria-live="polite"
        >
          <strong>
            {result.previewed
              ? `${rowsText(result.imported)} ${result.imported === 1 ? "looks" : "look"} good`
              : `${rowsText(result.imported)} imported`}
          </strong>
          {result.records !== result.imported
            ? ` · ${result.records.toLocaleString()} items ${result.previewed ? "would be created" : "created"}`
            : ""}
          {result.previewed ? " · nothing saved yet" : ""}
          {result.skipped ? ` · ${result.skipped.toLocaleString()} skipped` : ""}
          {result.previewed && result.imported && !result.errors.length ? (
            <span className="block mt-1">No problems found. Click Import to save.</span>
          ) : null}
        </div>
      ) : null}

      {result.notices.length ? (
        <ul className="muted list-disc space-y-1 pl-5 text-sm leading-6" aria-live="polite">
          {result.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}

      {result.warnings.length ? (
        <div className="notice notice-warning rounded-lg px-4 py-3 text-sm" aria-live="polite">
          <p className="font-semibold">Changed so these rows could import</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.errors.length ? (
        <div className="notice notice-error rounded-lg px-4 py-3 text-sm" aria-live="polite">
          <p className="font-semibold">
            {result.imported || result.skipped ? "Skipped rows" : "Couldn't read the file"}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.matched.length ? (
        <details className="form-section">
          <summary className="form-section-summary">
            <span className="form-section-title">Columns understood ({result.matched.length})</span>
          </summary>
          <ul className="form-section-body grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {result.matched.map((entry) => (
              <li key={`${entry.header}:${entry.label}`}>
                <span className="font-semibold">{entry.header}</span>
                <span className="muted"> → {entry.label}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </form>
  );
}
