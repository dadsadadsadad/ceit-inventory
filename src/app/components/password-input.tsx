"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";

// the label only wraps the input so screen readers just read the field name
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
