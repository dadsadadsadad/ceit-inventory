"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = ComponentProps<"button"> & { pendingLabel?: string };

// Disable repeat clicks while a form is saving.
export function SubmitButton({
  children,
  className = "",
  pendingLabel = "Saving...",
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
