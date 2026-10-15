import { ItemStatus } from "@prisma/client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { HoldSubmitButton } from "@/app/components/hold-submit-button";
import { SubmitButton } from "@/app/components/submit-button";

import { deleteInventoryItem, retireInventoryItem } from "../../actions/item";
import type { ItemRecord } from "./item-record";

export function RecordLifecycle({ item }: { item: ItemRecord }) {
  return (
    <>
      <section className="divider mt-6 border-t pt-5" aria-labelledby="record-lifecycle">
        <h3 id="record-lifecycle" className="text-sm font-semibold">
          Retire or delete
        </h3>
        <p className="muted mt-2 text-xs leading-5">Retiring can be undone. History is kept.</p>
        <FeedbackForm
          action={retireInventoryItem}
          optimistic={{ entity: `item:${item.id}`, values: { status: "RETIRED" } }}
          className="mt-3"
        >
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton
            disabled={item.status === ItemStatus.RETIRED}
            pendingLabel="Retiring..."
            className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            {item.status === ItemStatus.RETIRED ? "Item is retired" : "Retire item"}
          </SubmitButton>
        </FeedbackForm>

        <details className="danger-zone mt-4 rounded-lg p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Permanently delete this item
          </summary>
          <p className="mt-2 text-xs leading-5">
            Deletes the item, its PC details, photos and software. Items with borrowing or
            maintenance history can&apos;t be deleted.
          </p>
          <FeedbackForm action={deleteInventoryItem} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="confirmation" value="DELETE" />
            <HoldSubmitButton
              label="Permanently delete"
              confirmation={`Permanently delete ${item.name}? This cannot be undone.`}
            />
          </FeedbackForm>
        </details>
      </section>
    </>
  );
}
