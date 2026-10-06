import {
  customFieldInputName,
  type CustomFieldDefinition,
  type CustomFieldValues,
} from "@/lib/custom-fields";

/** One input per custom field, using the control that suits its kind of answer. */
export function CustomFieldInputs({
  fields,
  values = {},
}: {
  fields: CustomFieldDefinition[];
  values?: CustomFieldValues;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const name = customFieldInputName(field.id);
        const value = values[field.id];
        const className = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";
        return (
          <label key={field.id}>
            <span className="text-sm font-semibold">{field.label}</span>
            {field.fieldType === "YES_NO" ? (
              <select
                name={name}
                defaultValue={value === undefined ? "" : value === true ? "yes" : "no"}
                className={className}
              >
                <option value="">Not set</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : field.fieldType === "CHOICE" ? (
              <select name={name} defaultValue={String(value ?? "")} className={className}>
                <option value="">Not set</option>
                {field.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={name}
                type={
                  field.fieldType === "NUMBER"
                    ? "number"
                    : field.fieldType === "DATE"
                      ? "date"
                      : "text"
                }
                step={field.fieldType === "NUMBER" ? "any" : undefined}
                maxLength={field.fieldType === "TEXT" ? 500 : undefined}
                defaultValue={value === undefined ? "" : String(value)}
                className={className}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
