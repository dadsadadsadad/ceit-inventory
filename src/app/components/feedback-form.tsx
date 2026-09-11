"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef } from "react";

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

export function FeedbackForm({ action, children, className, successMessage = "Saved.", resetOnSuccess = true }: { action: Action; children: ReactNode; className?: string; successMessage?: string; resetOnSuccess?: boolean }) {
  const failedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [state, formAction] = useActionState(async (_previousState: ActionState, formData: FormData) => {
    try {
      failedRef.current = false;
      const result = await action(formData);
      if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
        failedRef.current = true;
        return { error: result.error, success: false };
      }
      formRef.current?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => { input.value = ""; });
      return { error: null, success: true };
    } catch (error) {
      if (isRedirect(error)) throw error;
      failedRef.current = true;
      return { error: safeErrorMessage(error), success: false };
    }
  }, initialState);
  useEffect(() => { if (state.error) feedbackRef.current?.focus(); }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className} onReset={(event) => { if (failedRef.current || !resetOnSuccess) event.preventDefault(); }}>
      {children}
      {state.error ? <p ref={feedbackRef} tabIndex={-1} className="notice notice-error form-feedback rounded-lg px-3 py-2 text-sm" role="alert">{state.error}</p> : null}
      {state.success ? <p className="notice notice-success form-feedback rounded-lg px-3 py-2 text-sm" role="status">{successMessage}</p> : null}
    </form>
  );
}
