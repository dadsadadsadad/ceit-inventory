"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = ComponentProps<"button"> & { pendingLabel?: string };

export function SubmitButton({ children, className = "", pendingLabel = "Saving...", disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return <button {...props} disabled={disabled || pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>{pending ? pendingLabel : children}</button>;
}
