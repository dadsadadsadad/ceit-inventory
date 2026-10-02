"use client";

import { useContext, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { SavingEntityContext } from "./feedback-form";
import { useOptimisticChanges } from "./optimistic-state";

type SubmitButtonProps = ComponentProps<"button"> & { pendingLabel?: string };

// Disable repeat clicks while a form is saving.
export function SubmitButton({
  children,
  className = "",
  pendingLabel = "Saving…",
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const entity = useContext(SavingEntityContext);
  const { values } = useOptimisticChanges();
  const saving = Boolean(entity && values[entity]);
  const busy = pending || saving;
  return (
    <button
      {...props}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={`${className} disabled:opacity-60 ${busy ? "cursor-wait" : "disabled:cursor-not-allowed"}`}
    >
      {busy ? pendingLabel : children}
    </button>
  );
}
