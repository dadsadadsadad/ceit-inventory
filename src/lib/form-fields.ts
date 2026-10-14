import "server-only";

import { stripControlCharacters } from "@/lib/clean-text";
import { FormError } from "@/lib/form-action";
import { isUuid } from "@/lib/ids";

// "categoryId" -> "Category"
export function fieldLabel(key: string) {
  const words = key
    .replace(/Id$/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// trimmed, null if blank, throws if too long
export function optionalText(
  formData: FormData,
  key: string,
  maxLength = 2_000,
  label = fieldLabel(key),
) {
  const value = stripControlCharacters(String(formData.get(key) ?? "")).trim();
  if (value.length > maxLength) {
    throw new FormError(`${label} is too long.`);
  }
  return value || null;
}

export function requiredText(
  formData: FormData,
  key: string,
  maxLength = 255,
  label = fieldLabel(key),
) {
  const value = optionalText(formData, key, maxLength, label);
  if (!value) {
    throw new FormError(`${label} is required.`);
  }
  return value;
}

export function requiredUuid(formData: FormData, key: string, message: string) {
  const value = requiredText(formData, key, 64);
  if (!isUuid(value)) {
    throw new FormError(message);
  }
  return value;
}
