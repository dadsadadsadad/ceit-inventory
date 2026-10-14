import { manilaDateTimeText } from "@/lib/manila-date";

// quote cells, escape formulas, dates in manila time
function cell(value: unknown) {
  const text = value instanceof Date ? manilaDateTimeText(value) : String(value ?? "");
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function createCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
