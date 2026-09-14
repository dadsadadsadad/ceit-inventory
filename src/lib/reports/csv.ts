// Quote cells and keep spreadsheet formulas as plain text.
function cell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

// Build CSV rows with quoted, spreadsheet-safe cells.
export function createCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
