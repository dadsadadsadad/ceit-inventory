"use client";

import { useEffect, useRef, useState } from "react";

import { cleanedTagCode, suggestTagCode, tagCodeLength } from "@/lib/asset-tag-code";

// suggests a code from the name field in the same form, the user can type their own
export function TagCodeInput({
  kind,
  usedCodes,
  otherCode,
  defaultValue = "",
  required = false,
  compact = false,
}: {
  kind: "category" | "room";
  usedCodes: string[];
  otherCode: string;
  defaultValue?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [suggested, setSuggested] = useState("");
  const [typed, setTyped] = useState(defaultValue);

  useEffect(() => {
    const name = input.current?.form?.elements.namedItem("name");
    if (!(name instanceof HTMLInputElement)) {
      return;
    }
    const others = usedCodes.filter((code) => code !== defaultValue);
    const update = () => {
      try {
        setSuggested(name.value.trim() ? suggestTagCode(name.value, others) : "");
      } catch {
        setSuggested("");
      }
    };
    update();
    name.addEventListener("input", update);
    return () => name.removeEventListener("input", update);
  }, [usedCodes, defaultValue]);

  const code = cleanedTagCode(typed) || suggested || "CODE";
  const example = kind === "category" ? `${code}-${otherCode}-0001` : `${otherCode}-${code}-0001`;
  const labelClass = compact
    ? "muted text-xs font-bold uppercase tracking-wide"
    : "text-sm font-semibold";

  return (
    <label>
      <span className={labelClass}>Asset tag code</span>
      <input
        ref={input}
        name="assetTagCode"
        required={required}
        value={typed}
        onChange={(event) => setTyped(event.target.value.toUpperCase())}
        maxLength={tagCodeLength.max}
        pattern={`[A-Za-z0-9]{${tagCodeLength.min},${tagCodeLength.max}}`}
        title={`${tagCodeLength.min} to ${tagCodeLength.max} letters or numbers.`}
        placeholder={suggested || "Auto"}
        className={`field mt-2 w-full rounded-lg px-3 ${compact ? "py-2" : "py-2.5"} text-sm uppercase`}
      />
      <span className="muted mt-1 block text-xs">
        Tags look like <code>{example}</code>.
        {defaultValue
          ? " Changing it only affects new tags."
          : " Leave empty to use the suggestion."}
      </span>
    </label>
  );
}
