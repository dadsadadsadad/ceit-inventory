import {
  CustomFieldError,
  parseCustomFieldValues,
  type CustomFieldDefinition,
  type CustomFieldValues,
} from "../custom-fields";
import { isNo, isYes, parseLooseDate, type Warn } from "./values";

/**
 * A spreadsheet column whose heading matches one of the extra fields set up in Settings goes into
 * that field. The cell is first put into the plain form the field expects ("Y" becomes "yes", a
 * typed date becomes YYYY-MM-DD); an answer that still does not fit is dropped with a warning.
 */
export function importedCustomValues(
  entries: { field: CustomFieldDefinition; raw: string }[],
  warn: Warn,
): CustomFieldValues {
  const values: CustomFieldValues = {};
  for (const { field, raw } of entries) {
    const text = raw.trim();
    if (!text) {
      continue;
    }
    const plain = plainAnswer(field, text);
    if (plain === null) {
      warn(`“${text.slice(0, 40)}” does not fit the ${field.label} field, so it was left blank.`);
      continue;
    }
    try {
      Object.assign(
        values,
        parseCustomFieldValues([field], (name) => (name === `custom:${field.id}` ? plain : null)),
      );
    } catch (error) {
      if (!(error instanceof CustomFieldError)) {
        throw error;
      }
      warn(`${error.message} It was left blank.`);
    }
  }
  return values;
}

function plainAnswer(field: CustomFieldDefinition, text: string) {
  switch (field.fieldType) {
    case "YES_NO":
      return isYes(text) ? "yes" : isNo(text) ? "no" : null;
    case "DATE": {
      const date = parseLooseDate(text);
      return date ? date.toISOString().slice(0, 10) : null;
    }
    case "NUMBER":
      return text.replace(/^(?:php|₱|\$)\s*/i, "").replaceAll(",", "");
    case "CHOICE":
      return field.choices.find((choice) => choice.toLowerCase() === text.toLowerCase()) ?? null;
    default:
      return text;
  }
}
