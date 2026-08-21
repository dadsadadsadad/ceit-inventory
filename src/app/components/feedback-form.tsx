"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";

type Action = (formData: FormData) => Promise<unknown>;
type ActionState = { error: string | null; success: boolean };

const initialState: ActionState = { error: null, success: false };

function isRedirect(error: unknown) {
  const details = error as { digest?: unknown; message?: unknown } | null;
  return String(details?.digest ?? details?.message ?? "").startsWith("NEXT_REDIRECT");
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unable to save this change. Please try again.";
  const message = error.message.trim();
  if (!message || message.length > 240 || /prisma|database|invalid `|\n/i.test(message)) return "Unable to save this change. Please try again.";
  return message;
}

export function FeedbackForm({ action, children, className, successMessage = "Saved successfully." }: { action: Action; children: ReactNode; className?: string; successMessage?: string }) {
  const [state, formAction] = useActionState(async (_previousState: ActionState, formData: FormData) => {
    try {
      await action(formData);
      return { error: null, success: true };
    } catch (error) {
      if (isRedirect(error)) throw error;
      return { error: safeErrorMessage(error), success: false };
    }
  }, initialState);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error ? <p className="notice form-feedback rounded-lg px-3 py-2 text-sm" role="alert">{state.error}</p> : null}
      {state.success ? <p className="notice notice-success form-feedback rounded-lg px-3 py-2 text-sm" role="status">{successMessage}</p> : null}
    </form>
  );
}
