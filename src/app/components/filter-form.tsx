"use client";

import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const typingDelayMs = 350;

/** Turn the form's fields into a clean query string: no blanks, and always back on page 1. */
function queryFromForm(form: HTMLFormElement) {
  const query = new URLSearchParams();
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string" && value.trim() !== "" && key !== "page") {
      query.append(key, value.trim());
    }
  }
  return query.toString();
}

/** Put the URL's values back into the fields, for the browser's back and forward buttons. */
function applyQueryToForm(form: HTMLFormElement, query: URLSearchParams) {
  for (const element of Array.from(form.elements)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !element.name ||
      element.type === "hidden" ||
      element.type === "submit" ||
      element.type === "button"
    ) {
      continue;
    }
    const values = query.getAll(element.name);
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = values.includes(element.value);
    } else if (element instanceof HTMLInputElement && element.type === "radio") {
      // A radio group with nothing in the URL goes back to its default choice.
      element.checked = values.length ? values.includes(element.value) : element.defaultChecked;
    } else {
      element.value = values[0] ?? "";
    }
  }
}

/**
 * A filter bar that applies itself: choices and checkboxes apply immediately and typing
 * applies shortly after you stop. The state lives in the URL, so every filtered view can be
 * bookmarked, shared, and reached again with the back button.
 */
export function FilterForm({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Accessible name for the search form, such as "Inventory filters". */
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const parameters = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const lastQuery = useRef<string>(parameters.toString());
  const [pending, startTransition] = useTransition();

  function apply() {
    window.clearTimeout(timer.current);
    const form = formRef.current;
    if (!form) {
      return;
    }
    const query = queryFromForm(form);
    if (query === lastQuery.current) {
      return;
    }
    lastQuery.current = query;
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
    const current = parameters.toString();
    if (current === lastQuery.current) {
      return;
    }
    lastQuery.current = current;
    if (formRef.current) {
      applyQueryToForm(formRef.current, new URLSearchParams(current));
    }
  }, [parameters]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function handleInput(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    // Text boxes wait for a pause in typing; everything else applies at once.
    if (["text", "search", "number", "tel", "email"].includes(target.type)) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(apply, typingDelayMs);
    }
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement &&
        ["checkbox", "radio", "date", "datetime-local"].includes(target.type))
    ) {
      apply();
    }
  }

  return (
    <form
      ref={formRef}
      role="search"
      aria-label={label}
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
      className={className}
      onInput={handleInput}
      onChange={handleChange}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      {children}
    </form>
  );
}

/** Clears every field in its form and applies the empty filter. */
export function ClearFiltersButton({
  children = "Clear",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        const form = event.currentTarget.form;
        if (!form) {
          return;
        }
        for (const element of Array.from(form.elements)) {
          if (element instanceof HTMLInputElement) {
            if (
              element.type === "hidden" ||
              element.type === "button" ||
              element.type === "submit"
            ) {
              continue;
            }
            if (element.type === "checkbox" || element.type === "radio") {
              element.checked = element.type === "radio" && element.value === "";
            } else {
              element.value = "";
            }
          } else if (
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
          ) {
            element.value = "";
          }
        }
        form.requestSubmit();
      }}
    >
      {children}
    </button>
  );
}
