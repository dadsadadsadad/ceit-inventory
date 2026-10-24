import { OptimisticText } from "@/app/components/optimistic-state";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { TagCodeInput } from "./tag-code-input";

import { deleteCategory, setCategoryActive, updateCategory } from "../actions";

export function CategoryEditor({
  category,
  usedCodes,
  otherCode,
}: {
  usedCodes: string[];
  otherCode: string;
  category: {
    id: string;
    name: string;
    assetTagCode: string | null;
    description: string | null;
    isActive: boolean;
    _count: { items: number };
  };
}) {
  return (
    <details className="section-disclosure card-muted rounded-lg p-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          <strong>
            <OptimisticText entity={`category:${category.id}`} field="name">
              {category.name}
            </OptimisticText>
          </strong>
          {category.description ? <span className="muted"> · {category.description}</span> : null}
        </span>
        <span className="flex items-center gap-3">
          <span
            className="tag-code-chip asset-code"
            title="Code used in asset tags"
            aria-label={`Tag code ${category.assetTagCode ?? "not set"}`}
          >
            {category.assetTagCode ?? "No code"}
          </span>
          <span className="muted">
            {category._count.items} record{category._count.items === 1 ? "" : "s"}
          </span>
          {!category.isActive ? (
            <span className="status-pill rounded-md px-2 py-1 text-xs font-semibold">Inactive</span>
          ) : null}
        </span>
      </summary>
      <FeedbackForm
        resetOnSuccess={false}
        action={updateCategory}
        optimistic={{ entity: `category:${category.id}`, fields: { name: "name" } }}
        revision={JSON.stringify(category)}
        className="divider mt-4 grid gap-3 border-t pt-4 category-editor-grid"
      >
        <input type="hidden" name="id" value={category.id} />
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Name</span>
          <input
            required
            name="name"
            defaultValue={category.name}
            maxLength={255}
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <TagCodeInput
          kind="category"
          compact
          required
          defaultValue={category.assetTagCode ?? ""}
          usedCodes={usedCodes}
          otherCode={otherCode}
        />
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Description</span>
          <input
            name="description"
            defaultValue={category.description ?? ""}
            maxLength={2_000}
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <SubmitButton
          pendingLabel="Saving..."
          className="secondary-button rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Save
        </SubmitButton>
      </FeedbackForm>
      <FeedbackForm action={setCategoryActive} className="mt-3">
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="isActive" value={String(!category.isActive)} />
        <SubmitButton pendingLabel="Updating..." className="accent-link text-xs font-semibold">
          {category.isActive ? "Deactivate category" : "Reactivate category"}
        </SubmitButton>
        {category.isActive && category._count.items > 0 ? (
          <span className="muted ml-2 text-xs">Items keep this category.</span>
        ) : null}
      </FeedbackForm>
      <FeedbackForm action={deleteCategory} className="divider mt-4 border-t pt-4">
        <input type="hidden" name="id" value={category.id} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">
              Type DELETE to confirm
            </span>
            <input
              required
              disabled={category._count.items > 0}
              name="confirmation"
              maxLength={16}
              className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
              placeholder="DELETE"
              aria-label={`Type DELETE to remove ${category.name}`}
            />
          </label>
          <SubmitButton
            disabled={category._count.items > 0}
            pendingLabel="Deleting..."
            className="danger-button rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Delete category
          </SubmitButton>
        </div>
        <p className="muted mt-2 text-xs">
          {category._count.items > 0
            ? `This category has ${category._count.items} linked inventory record${category._count.items === 1 ? "" : "s"} so it can't be deleted.`
            : "Only categories with no items can be deleted."}
        </p>
      </FeedbackForm>
    </details>
  );
}
