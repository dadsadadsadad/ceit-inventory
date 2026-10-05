import { OptimisticText } from "@/app/components/optimistic-state";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { deleteCategory, setCategoryActive, updateCategory } from "../actions";

// Edit a category or stop using it for new items.
export function CategoryEditor({
  category,
}: {
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
          <span className="muted">
            {category._count.items} record{category._count.items === 1 ? "" : "s"}
          </span>
          {!category.isActive ? (
            <span className="status-pill rounded-md px-2 py-1 text-xs font-semibold">Inactive</span>
          ) : null}
        </span>
      </summary>
      {/* Save category details. */}
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
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Tag code</span>
          <input
            required
            name="assetTagCode"
            defaultValue={category.assetTagCode ?? ""}
            maxLength={3}
            pattern="[A-Za-z0-9]{3}"
            title="Use three letters or numbers."
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
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
          pendingLabel="Saving…"
          className="secondary-button rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Save
        </SubmitButton>
      </FeedbackForm>
      {/* Enable or disable this category. */}
      <FeedbackForm action={setCategoryActive} className="mt-3">
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="isActive" value={String(!category.isActive)} />
        <SubmitButton pendingLabel="Updating…" className="accent-link text-xs font-semibold">
          {category.isActive ? "Deactivate category" : "Reactivate category"}
        </SubmitButton>
        {category.isActive && category._count.items > 0 ? (
          <span className="muted ml-2 text-xs">Existing records keep this category.</span>
        ) : null}
      </FeedbackForm>
      {/* Delete an unused category. */}
      <FeedbackForm action={deleteCategory} className="divider mt-4 border-t pt-4">
        <input type="hidden" name="id" value={category.id} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">
              Type DELETE to remove this category
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
            pendingLabel="Deleting…"
            className="danger-button rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Delete category
          </SubmitButton>
        </div>
        <p className="muted mt-2 text-xs">
          {category._count.items > 0
            ? `This category has ${category._count.items} linked inventory record${category._count.items === 1 ? "" : "s"} and cannot be deleted yet.`
            : "Deletion is permanent and is only available while no inventory records use this category."}
        </p>
      </FeedbackForm>
    </details>
  );
}
