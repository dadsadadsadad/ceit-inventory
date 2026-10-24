import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { markInventoryItemChecked } from "../../actions/item";

export function MarkCheckedButton({ className, itemId }: { className: string; itemId: string }) {
  return (
    <FeedbackForm
      action={markInventoryItemChecked}
      successMessage="Marked as checked."
      className="mark-checked-form"
    >
      <input type="hidden" name="id" value={itemId} />
      <SubmitButton pendingLabel="Saving..." className={className}>
        Mark as checked
      </SubmitButton>
    </FeedbackForm>
  );
}
