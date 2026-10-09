"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";

/**
 * A labelled password box with a button that shows what was typed, so it can be checked before
 * saving. The label names only the box; the button and the hint sit outside it, so a screen
 * reader announces "New password", not every word around it.
 */
export function PasswordInput({
  hint,
  id,
  label,
  labelClassName = "block text-sm font-semibold",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  hint?: string;
  label: string;
  labelClassName?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-block">
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>
      <span className="password-field mt-2">
        <input
          {...props}
          id={inputId}
          type={visible ? "text" : "password"}
          aria-describedby={hint ? hintId : undefined}
          data-password=""
        />
        <button
          type="button"
          className="password-toggle"
          aria-label="Show password"
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
      {hint ? (
        <span id={hintId} className="muted mt-1 block text-xs">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
