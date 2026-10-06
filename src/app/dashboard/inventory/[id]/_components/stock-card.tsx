import { FeedbackForm } from "@/app/components/feedback-form";
import { OptimisticText } from "@/app/components/optimistic-state";
import { StockBadge } from "@/app/components/stock-badge";
import { SubmitButton } from "@/app/components/submit-button";
import { lowStockLevelFor, stockLevelSummary } from "@/lib/stock-level";

import { adjustStockQuantity } from "../../actions/item";
import type { ItemRecord } from "./item-record";

// Stock records: how many are left, whether that is running low, and a quick way to add or use some.
export function StockCard({ item }: { item: ItemRecord }) {
  return (
    <section className="card rounded-lg p-5 sm:p-6" aria-labelledby="stock-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stock-heading" className="text-lg font-semibold">
          Stock
        </h2>
        <StockBadge item={item} showCount />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <p className="stock-count">
          <OptimisticText entity={`item:${item.id}`} field="quantity">
            {item.quantity}
          </OptimisticText>
          <span className="muted"> in stock</span>
        </p>
        <p className="muted text-sm leading-6">
          {stockLevelSummary(item)}{" "}
          {item.lowStockThreshold === null
            ? "Using the standard alert level."
            : `Set to ${lowStockLevelFor(item)} for this item.`}
        </p>
      </div>
      <FeedbackForm
        action={adjustStockQuantity}
        successMessage="Stock updated."
        className="stock-adjust mt-5"
      >
        <input type="hidden" name="id" value={item.id} />
        <fieldset className="filter-chips">
          <legend className="sr-only">What happened to the stock</legend>
          <label className="filter-chip">
            <input type="radio" name="direction" value="add" defaultChecked />
            <span>Add stock</span>
          </label>
          <label className="filter-chip">
            <input type="radio" name="direction" value="use" />
            <span>Use stock</span>
          </label>
        </fieldset>
        <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end">
          <label>
            <span className="text-sm font-semibold">How many</span>
            <input
              required
              name="amount"
              type="number"
              min="1"
              max="1000000"
              inputMode="numeric"
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Note (optional)</span>
            <input
              name="note"
              maxLength={200}
              placeholder="Delivery, used in class, …"
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <SubmitButton
            pendingLabel="Saving…"
            className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Update stock
          </SubmitButton>
        </div>
      </FeedbackForm>
    </section>
  );
}
