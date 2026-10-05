import { formatManilaDate, manilaCalendarDate } from "@/lib/manila-date";

export function dateValue(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

// The inspection date is shown in Philippine time, so the edit field must use that day as well.
export function manilaDateValue(value?: Date | null) {
  return value ? manilaCalendarDate(value) : "";
}

export function displayDate(value?: Date | null) {
  return value
    ? formatManilaDate(value, { day: "numeric", month: "short", year: "numeric" })
    : "Not recorded";
}

const philippinePeso = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  minimumFractionDigits: 2,
  style: "currency",
});

export function displayPurchasePrice(value?: { toString: () => string } | null) {
  if (value === null || value === undefined) {
    return "Not recorded";
  }
  return philippinePeso.format(Number(value.toString()));
}

// Reuse the same label and input layout.
export function TextField({
  name,
  label: fieldLabel,
  value,
  type = "text",
  placeholder,
  required = false,
  maxLength,
  max,
  min,
  step,
  readOnly = false,
}: {
  name: string;
  label: string;
  value?: string | number | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  max?: number;
  min?: number;
  step?: number;
  readOnly?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{fieldLabel}</span>
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        required={required}
        max={max}
        maxLength={maxLength}
        min={min}
        step={step}
        readOnly={readOnly}
        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
      />
    </label>
  );
}

// Display one label and value in the item summary.
export function Detail({
  label: detailLabel,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="muted text-xs font-bold uppercase tracking-wide">{detailLabel}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{children}</dd>
    </div>
  );
}
