"use client";

import type { ReactNode } from "react";
import { createContext, useActionState, useEffect, useOptimistic, useRef } from "react";
import { useOptimisticChanges, type OptimisticChange } from "./optimistic-state";
import { useRouter } from "next/navigation";

type Action = (formData: FormData) => Promise<unknown>;
type ActionState = { error: string | null; success: boolean };

const initialState: ActionState = { error: null, success: false };
export const SavingEntityContext = createContext<string | undefined>(undefined);

// Let Next.js redirects pass through form error handling.
function isRedirect(error: unknown) {
  const details = error as { digest?: unknown; message?: unknown } | null;
  return String(details?.digest ?? details?.message ?? "").startsWith("NEXT_REDIRECT");
}

// Use a fallback when the error has no usable message.
function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unable to save this change. Please try again.";
  }
  const message = error.message.trim();
  if (!message || message.length > 240 || /prisma|database|invalid `|\n/i.test(message)) {
    return "Unable to save this change. Please try again.";
  }
  return message;
}

// Submit a form and show its result without losing failed inputs.
export function FeedbackForm({
  action,
  children,
  className,
  successMessage = "Saved.",
  resetOnSuccess = true,
  optimistic,
  pendingMessage,
  revision,
  savedValues,
  optimisticInventoryBulk = false,
  createPreview,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  optimistic?: OptimisticChange;
  pendingMessage?: string;
  revision?: string;
  savedValues?: Record<string, string | number | boolean | null>;
  optimisticInventoryBulk?: boolean;
  createPreview?: { titleField: string; detailFields?: string[] };
}) {
  const changes = useOptimisticChanges();
  const router = useRouter();
  const failedRef = useRef(false);
  const dirtyRef = useRef(false);
  const editedVersion = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [preview, setPreview] = useOptimistic<{ title: string; details: string } | null>(null);
  const [state, formAction, pending] = useActionState(
    async (_previousState: ActionState, formData: FormData) => {
      let success = false;
      const started: string[] = [];
      function fieldLabel(field: string) {
        const control = formRef.current?.elements.namedItem(field);
        return control instanceof HTMLSelectElement
          ? (control.selectedOptions[0]?.textContent ?? "")
          : String(formData.get(field) ?? "");
      }
      try {
        failedRef.current = false;
        const patches: { entity: string; values: Record<string, string> }[] = [];
        if (optimistic) {
          const values = { ...optimistic.values };
          for (const [key, field] of Object.entries(optimistic.fields ?? {})) {
            const control = formRef.current?.elements.namedItem(field);
            values[key] =
              control instanceof HTMLSelectElement && key !== "status"
                ? (control.selectedOptions[0]?.textContent ?? "")
                : String(formData.get(field) ?? "");
          }
          patches.push({ entity: optimistic.entity, values });
        }
        if (optimisticInventoryBulk) {
          const action = String(formData.get("bulkAction"));
          const field = (
            {
              status: "bulkStatus",
              condition: "bulkCondition",
              location: "bulkLocationId",
            } as Record<string, string>
          )[action];
          if (field || action === "remove") {
            const values =
              action === "remove"
                ? { status: "RETIRED" }
                : {
                    [action]: action === "status" ? String(formData.get(field)) : fieldLabel(field),
                  };
            for (const id of formData.getAll("itemIds")) {
              patches.push({ entity: `item:${id}`, values });
            }
          }
        }
        for (const patch of patches) {
          if (!changes.begin(patch)) {
            failedRef.current = true;
            return { error: "This record is already saving. Please wait.", success: false };
          }
          started.push(patch.entity);
        }
        if (createPreview) {
          setPreview({
            title: fieldLabel(createPreview.titleField),
            details: (createPreview.detailFields ?? []).map(fieldLabel).filter(Boolean).join(" · "),
          });
        }
        formRef.current?.setAttribute("data-saving", "true");
        if (editedVersion.current !== null) {
          formData.set("updatedAt", editedVersion.current);
        }
        const result = await action(formData);
        if (
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
        ) {
          failedRef.current = true;
          return { error: result.error, success: false };
        }
        formRef.current
          ?.querySelectorAll<HTMLInputElement>('input[type="password"]')
          .forEach((input) => {
            input.value = "";
          });
        success = true;
        dirtyRef.current = false;
        editedVersion.current = null;
        formRef.current?.removeAttribute("data-dirty");
        return { error: null, success: true };
      } catch (error) {
        if (isRedirect(error)) {
          success = true;
          dirtyRef.current = false;
          editedVersion.current = null;
          formRef.current?.removeAttribute("data-dirty");
          throw error;
        }
        failedRef.current = true;
        return { error: safeErrorMessage(error), success: false };
      } finally {
        for (const entity of started) {
          changes.end(entity);
        }
        formRef.current?.removeAttribute("data-saving");
        window.dispatchEvent(new CustomEvent("ceit:mutation", { detail: { success } }));
      }
    },
    initialState,
  );
  useEffect(() => {
    if (state.error) {
      feedbackRef.current?.focus();
    }
  }, [state]);

  // React preserves uncontrolled field values across RSC refreshes. Synchronize only
  // pristine forms, so remote updates appear without erasing unfinished input.
  useEffect(() => {
    if (revision === undefined || dirtyRef.current || pending) {
      return;
    }
    formRef.current
      ?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, select, textarea",
      )
      .forEach((control) => {
        if (control instanceof HTMLInputElement) {
          if (control.type === "file" || control.type === "password" || control.type === "hidden") {
            return;
          }
          if (control.type === "checkbox" || control.type === "radio") {
            control.checked = control.defaultChecked;
          } else {
            control.value = control.defaultValue;
          }
        } else if (control instanceof HTMLSelectElement) {
          const value = savedValues?.[control.name];
          if (value !== undefined) {
            control.value = String(value ?? "");
          }
        } else {
          control.value = control.defaultValue;
        }
      });
  }, [revision, pending, savedValues]);

  return (
    <SavingEntityContext value={optimistic?.entity}>
      <form
        ref={formRef}
        action={formAction}
        className={className}
        aria-busy={pending || undefined}
        onChange={(event) => {
          // Selection alone is safe to preserve through incoming inventory updates.
          if (
            event.target instanceof HTMLInputElement &&
            event.target.hasAttribute("data-bulk-selection-item")
          ) {
            return;
          }
          if (!dirtyRef.current) {
            const version = formRef.current?.elements.namedItem("updatedAt");
            editedVersion.current = version instanceof HTMLInputElement ? version.value : null;
          }
          dirtyRef.current = true;
          formRef.current?.setAttribute("data-dirty", "true");
        }}
        onSubmitCapture={(event) => {
          if (pending || (optimistic && changes.values[optimistic.entity])) {
            event.preventDefault();
          }
        }}
        onReset={(event) => {
          if (failedRef.current || !resetOnSuccess) {
            event.preventDefault();
          }
        }}
      >
        {preview ? (
          <article className="optimistic-preview" data-optimistic="true" aria-live="polite">
            <span className="eyebrow">Adding record…</span>
            <h3 className="mt-1 font-semibold">{preview.title}</h3>
            {preview.details ? <p className="muted mt-1 text-sm">{preview.details}</p> : null}
            <p className="muted mt-2 text-sm">
              Waiting for confirmation. Your details are kept if this cannot be saved.
            </p>
          </article>
        ) : null}
        {children}
        {pending && pendingMessage ? (
          <p className="notice form-feedback rounded-lg px-3 py-2 text-sm" role="status">
            {pendingMessage}
          </p>
        ) : null}
        {!pending && state.error ? (
          <div className="form-feedback space-y-2">
            <p
              ref={feedbackRef}
              tabIndex={-1}
              className="notice notice-error form-feedback rounded-lg px-3 py-2 text-sm"
              role="alert"
            >
              {/* Focus the error message after a failed submission. */}
              {state.error}
            </p>
            {revision !== undefined ? (
              <button
                type="button"
                className="secondary-button rounded-lg px-3 py-2 text-sm"
                onClick={() => {
                  editedVersion.current = null;
                  router.refresh();
                }}
              >
                Refresh details, keep my inputs
              </button>
            ) : null}
          </div>
        ) : null}
        {!pending && state.success ? (
          <p
            className="notice notice-success form-feedback rounded-lg px-3 py-2 text-sm"
            role="status"
          >
            {/* Confirmation after a successful submission. */}
            {successMessage}
          </p>
        ) : null}
      </form>
    </SavingEntityContext>
  );
}
