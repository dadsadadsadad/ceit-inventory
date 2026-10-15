import { CustomFieldType, ItemType } from "@prisma/client";

// answers are stored on each item

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

export const maxCustomFields = 40;
export const maxCustomTextLength = 500;

export function customFieldInputName(id: string) {
  return `custom:${id}`;
}

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

// empty answers are left out. read is formData.get
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
        if (text.length > maxCustomTextLength) {
          throw new CustomFieldError(
            `${field.label} must be ${maxCustomTextLength} characters or fewer.`,
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

// only CHOICE fields, needs at least 2
export function validatedChoices(fieldType: CustomFieldType, text: string) {
  if (fieldType !== CustomFieldType.CHOICE) {
    return [];
  }
  const choices = parseChoices(text);
  if (choices.length < 2) {
    throw new CustomFieldError("Add at least two options, one per line.");
  }
  if (choices.some((choice) => choice.length > 80)) {
    throw new CustomFieldError("Options can be up to 80 characters.");
  }
  return choices;
}

// one per line or comma separated
export function parseChoices(text: string) {
  const choices = text
    .split(/[\n,]/)
    .map((choice) => choice.trim())
    .filter(Boolean);
  return [...new Set(choices)].slice(0, 30);
}
