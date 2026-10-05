import { manilaDateTimeText } from "@/lib/manila-date";

// Quote cells and keep spreadsheet formulas as plain text. Dates use Philippine time so they match
// the screens and PDF reports instead of showing a UTC timestamp.
function cell(value: unknown) {
  const text = value instanceof Date ? manilaDateTimeText(value) : String(value ?? "");
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

// Build CSV rows with quoted, spreadsheet-safe cells.
export function createCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
