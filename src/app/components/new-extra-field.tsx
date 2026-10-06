"use client";

import { useState } from "react";

import { customFieldLabels } from "@/lib/custom-fields";

const kinds = ["TEXT", "NUMBER", "DATE", "YES_NO", "CHOICE"] as const;
type Kind = (typeof kinds)[number];

/**
 * "Add a new extra field" inside an item form: name it, say what kind of answer it takes, and
 * fill it in for this item, all in one save. The field then exists for every item (Settings can
 * narrow it to one type or category).
 */
export function NewExtraField() {
  const [kind, setKind] = useState<Kind>("TEXT");
  const control = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";

  return (
    <details className="section-disclosure mt-4">
      <summary className="accent-link cursor-pointer text-sm font-semibold">
        Add a new extra field
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <p className="muted text-sm leading-6 sm:col-span-2">
          Need to record something that is not here yet? Name it and it appears on every item.
        </p>
        <label>
          <span className="text-sm font-semibold">Field name</span>
          <input
            name="newFieldLabel"
            maxLength={60}
            className={control}
            placeholder="Lens mount, Funding source, Color…"
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Kind of answer</span>
          <select
            name="newFieldType"
            value={kind}
            onChange={(event) => setKind(event.target.value as Kind)}
            className={control}
          >
            {kinds.map((value) => (
              <option key={value} value={value}>
                {customFieldLabels[value]}
              </option>
            ))}
          </select>
        </label>
        {kind === "CHOICE" ? (
          <label className="sm:col-span-2">
            <span className="text-sm font-semibold">Answers to choose from</span>
            <textarea
              name="newFieldChoices"
              rows={3}
              className={control}
              placeholder={"One answer per line, at least two."}
            />
          </label>
        ) : null}
        <label className="sm:col-span-2">
          <span className="text-sm font-semibold">Answer for this item</span>
          {kind === "YES_NO" ? (
            <select name="newFieldValue" defaultValue="" className={control}>
              <option value="">Not set</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          ) : (
            <input
              name="newFieldValue"
              type={kind === "NUMBER" ? "number" : kind === "DATE" ? "date" : "text"}
              step={kind === "NUMBER" ? "any" : undefined}
              maxLength={500}
              className={control}
              placeholder={kind === "CHOICE" ? "Type one of the answers above" : undefined}
            />
          )}
        </label>
      </div>
    </details>
  );
}
