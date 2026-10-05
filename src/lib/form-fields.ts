import "server-only";

import { FormError } from "@/lib/form-action";
import { isUuid } from "@/lib/ids";

/** "assetTagCode" becomes "Asset tag code"; a trailing "Id" is dropped ("categoryId" → "Category"). */
export function fieldLabel(key: string) {
  const words = key
    .replace(/Id$/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A trimmed text field, or `null` when it is blank. Throws a form error when it is too long. */
export function optionalText(
  formData: FormData,
  key: string,
  maximumLength = 2_000,
  label = fieldLabel(key),
) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maximumLength) {
    throw new FormError(`${label} is too long.`);
  }
  return value || null;
}

export function requiredText(
  formData: FormData,
  key: string,
  maximumLength = 255,
  label = fieldLabel(key),
) {
  const value = optionalText(formData, key, maximumLength, label);
  if (!value) {
    throw new FormError(`${label} is required.`);
  }
  return value;
}

/** A required record ID. `message` is shown when the value is not a valid UUID. */
export function requiredUuid(formData: FormData, key: string, message: string) {
  const value = requiredText(formData, key, 64);
  if (!isUuid(value)) {
    throw new FormError(message);
  }
  return value;
}
