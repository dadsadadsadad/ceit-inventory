import { CustomFieldType, ItemType } from "@prisma/client";

/** Extra details staff can add to items, such as "Lens mount". Values live on each item. */

export type CustomFieldDefinition = {
  appliesTo: ItemType | null;
  categoryId: string | null;
  choices: string[];
  fieldType: CustomFieldType;
  id: string;
  label: string;
  sortOrder: number;
};

export type CustomFieldValue = string | number | boolean;
export type CustomFieldValues = Record<string, CustomFieldValue>;

export const customFieldLabels: Record<CustomFieldType, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  YES_NO: "Yes or no",
  CHOICE: "Choose from a list",
};

export const maximumCustomFields = 40;
export const maximumCustomTextLength = 500;

/** The form field name for one custom field. */
export function customFieldInputName(id: string) {
  return `custom:${id}`;
}

/** The fields that apply to an item of this type and category. */
export function customFieldsFor(
  definitions: CustomFieldDefinition[],
  item: { categoryId?: string | null; itemType?: ItemType | null },
) {
  return definitions.filter(
    (field) =>
      (!field.appliesTo || !item.itemType || field.appliesTo === item.itemType) &&
      (!field.categoryId || !item.categoryId || field.categoryId === item.categoryId),
  );
}

/** Read the values stored on an item, ignoring anything that is not a plain value. */
export function readCustomValues(stored: unknown): CustomFieldValues {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }
  const values: CustomFieldValues = {};
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      values[key] = value;
    }
  }
  return values;
}

/** A value as people read it: "Yes", a formatted date, or the text itself. */
export function formatCustomValue(
  field: CustomFieldDefinition,
  value: CustomFieldValue | undefined,
) {
  if (value === undefined || value === "") {
    return null;
  }
  if (field.fieldType === "YES_NO") {
    return value === true || value === "yes" ? "Yes" : "No";
  }
  if (field.fieldType === "DATE" && typeof value === "string") {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("en-PH", {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
          year: "numeric",
        });
  }
  return String(value);
}

export class CustomFieldError extends Error {}

/**
 * Turn submitted form values into the values to store. Empty answers are left out, so a field
 * nobody filled in takes no space. `read` is `formData.get`.
 */
export function parseCustomFieldValues(
  fields: CustomFieldDefinition[],
  read: (name: string) => FormDataEntryValue | null,
): CustomFieldValues {
  const values: CustomFieldValues = {};
  for (const field of fields) {
    const raw = read(customFieldInputName(field.id));
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) {
      continue;
    }
    switch (field.fieldType) {
      case "TEXT":
        if (text.length > maximumCustomTextLength) {
          throw new CustomFieldError(
            `${field.label} must be ${maximumCustomTextLength} characters or fewer.`,
          );
        }
        values[field.id] = text;
        break;
      case "NUMBER": {
        const number = Number(text);
        if (!Number.isFinite(number) || Math.abs(number) > 1e12) {
          throw new CustomFieldError(`${field.label} must be a number.`);
        }
        values[field.id] = number;
        break;
      }
      case "DATE": {
        const date = new Date(`${text}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime())) {
          throw new CustomFieldError(`${field.label} must be a valid date.`);
        }
        values[field.id] = text;
        break;
      }
      case "YES_NO":
        if (text !== "yes" && text !== "no") {
          throw new CustomFieldError(`${field.label} must be yes or no.`);
        }
        values[field.id] = text === "yes";
        break;
      case "CHOICE":
        if (!field.choices.includes(text)) {
          throw new CustomFieldError(`Choose one of the listed answers for ${field.label}.`);
        }
        values[field.id] = text;
        break;
    }
  }
  return values;
}

/** The list of answers for a field. Only "choose from a list" fields have one, and it needs two. */
export function validatedChoices(fieldType: CustomFieldType, text: string) {
  if (fieldType !== CustomFieldType.CHOICE) {
    return [];
  }
  const choices = parseChoices(text);
  if (choices.length < 2) {
    throw new CustomFieldError("Give at least two answers to choose from, one per line.");
  }
  if (choices.some((choice) => choice.length > 80)) {
    throw new CustomFieldError("Each answer must be 80 characters or fewer.");
  }
  return choices;
}

/** The answers for a CHOICE field, typed one per line or separated by commas. */
export function parseChoices(text: string) {
  const choices = text
    .split(/[\n,]/)
    .map((choice) => choice.trim())
    .filter(Boolean);
  return [...new Set(choices)].slice(0, 30);
}
