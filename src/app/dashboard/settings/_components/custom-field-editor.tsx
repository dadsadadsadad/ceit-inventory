import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { customFieldLabels } from "@/lib/custom-fields";
import { CustomFieldType, ItemType } from "@prisma/client";

import {
  createCustomField,
  deleteCustomField,
  setCustomFieldActive,
  updateCustomField,
} from "../custom-field-actions";

type Category = { id: string; name: string };

type Field = {
  appliesTo: ItemType | null;
  categoryId: string | null;
  choices: string[];
  fieldType: CustomFieldType;
  id: string;
  isActive: boolean;
  label: string;
};

function ScopeFields({
  categories,
  field,
}: {
  categories: Category[];
  field?: Pick<Field, "appliesTo" | "categoryId">;
}) {
  return (
    <>
      <label>
        <span className="muted text-xs font-bold uppercase tracking-wide">Applies to</span>
        <select
          name="appliesTo"
          defaultValue={field?.appliesTo ?? ""}
          className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Equipment and stock</option>
          <option value="ASSET">Equipment only</option>
          <option value="SUPPLY">Stock only</option>
        </select>
      </label>
      <label>
        <span className="muted text-xs font-bold uppercase tracking-wide">Category</span>
        <select
          name="categoryId"
          defaultValue={field?.categoryId ?? ""}
          className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Every category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

// Add a new extra field.
export function NewCustomField({ categories }: { categories: Category[] }) {
  return (
    <details className="section-disclosure">
      <summary className="accent-link cursor-pointer text-sm font-semibold">
        Add extra field
      </summary>
      <FeedbackForm
        action={createCustomField}
        createPreview={{ titleField: "label", detailFields: ["fieldType"] }}
        className="mt-5 grid gap-4 sm:grid-cols-2"
      >
        <label>
          <span className="text-sm font-semibold">Field name *</span>
          <input
            required
            name="label"
            maxLength={60}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            placeholder="Lens mount, Funding source, Color…"
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Kind of answer</span>
          <select
            name="fieldType"
            defaultValue="TEXT"
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          >
            {Object.values(CustomFieldType).map((type) => (
              <option key={type} value={type}>
                {customFieldLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <ScopeFields categories={categories} />
        <label className="sm:col-span-2">
          <span className="text-sm font-semibold">Answers to choose from</span>
          <textarea
            name="choices"
            rows={3}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            placeholder={"Only for “Choose from a list”. One answer per line."}
          />
        </label>
        <div className="sm:col-span-2">
          <SubmitButton
            pendingLabel="Adding field…"
            className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Add field
          </SubmitButton>
        </div>
      </FeedbackForm>
    </details>
  );
}

// Edit, hide, or remove one extra field.
export function CustomFieldEditor({ categories, field }: { categories: Category[]; field: Field }) {
  const category = categories.find((entry) => entry.id === field.categoryId);
  const scope = [
    field.appliesTo === "ASSET"
      ? "Equipment"
      : field.appliesTo === "SUPPLY"
        ? "Stock"
        : "All items",
    category?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="section-disclosure card-muted rounded-lg p-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          <strong>{field.label}</strong>
          <span className="muted"> · {customFieldLabels[field.fieldType]}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="muted">{scope}</span>
          {!field.isActive ? (
            <span className="status-pill status-pill-retired rounded-md px-2 py-1 text-xs font-semibold">
              Hidden
            </span>
          ) : null}
        </span>
      </summary>
      <FeedbackForm
        resetOnSuccess={false}
        action={updateCustomField}
        revision={JSON.stringify(field)}
        className="divider mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
      >
        <input type="hidden" name="id" value={field.id} />
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Name</span>
          <input
            required
            name="label"
            defaultValue={field.label}
            maxLength={60}
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <div />
        <ScopeFields categories={categories} field={field} />
        {field.fieldType === "CHOICE" ? (
          <label className="sm:col-span-2">
            <span className="muted text-xs font-bold uppercase tracking-wide">Answers</span>
            <textarea
              name="choices"
              rows={3}
              defaultValue={field.choices.join("\n")}
              className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
        ) : null}
        <div className="sm:col-span-2">
          <SubmitButton
            pendingLabel="Saving…"
            className="secondary-button rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Save
          </SubmitButton>
        </div>
      </FeedbackForm>
      <FeedbackForm action={setCustomFieldActive} className="mt-3">
        <input type="hidden" name="id" value={field.id} />
        <input type="hidden" name="isActive" value={String(!field.isActive)} />
        <SubmitButton pendingLabel="Updating…" className="accent-link text-xs font-semibold">
          {field.isActive ? "Hide this field" : "Show this field again"}
        </SubmitButton>
        <span className="muted ml-2 text-xs">
          Hiding keeps what was recorded; deleting removes it from view.
        </span>
      </FeedbackForm>
      <FeedbackForm action={deleteCustomField} className="divider mt-4 border-t pt-4">
        <input type="hidden" name="id" value={field.id} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">
              Type DELETE to remove this field
            </span>
            <input
              required
              name="confirmation"
              maxLength={16}
              className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
              placeholder="DELETE"
              aria-label={`Type DELETE to remove ${field.label}`}
            />
          </label>
          <SubmitButton
            pendingLabel="Deleting…"
            className="danger-button rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Delete field
          </SubmitButton>
        </div>
      </FeedbackForm>
    </details>
  );
}
