import type { ReactNode } from "react";

/**
 * A group of related form fields that opens and closes. Optional groups start closed so a form
 * shows only what is needed to get started; everything inside still submits when closed.
 */
export function FormSection({
  children,
  defaultOpen = false,
  hint,
  optional = true,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: string;
  optional?: boolean;
  title: string;
}) {
  return (
    <details className="form-section" open={defaultOpen}>
      <summary className="form-section-summary">
        <span className="form-section-title">{title}</span>
        {optional ? <span className="form-section-tag">Optional</span> : null}
        {hint ? <span className="form-section-hint">{hint}</span> : null}
      </summary>
      <div className="form-section-body">{children}</div>
    </details>
  );
}
