import type { ReactNode } from "react";

// collapsible group of fields, closed fields still submit
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
