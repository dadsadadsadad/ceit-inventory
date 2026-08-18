"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";

type Action = (formData: FormData) => Promise<unknown>;
type ActionState = { error: string | null };

const initialState: ActionState = { error: null };

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

export function FeedbackForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(async (_previousState: ActionState, formData: FormData) => {
    try {
      await action(formData);
      return initialState;
    } catch (error) {
      if (isRedirect(error)) throw error;
      return { error: safeErrorMessage(error) };
    }
  }, initialState);

  return (
    <form action={formAction} className={className} noValidate>
      {children}
      {state.error ? <p className="notice rounded-lg px-3 py-2 text-sm" role="alert">{state.error}</p> : null}
    </form>
  );
}
