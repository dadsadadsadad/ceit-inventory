/** Match common phone formatting without exposing borrower details publicly. */
export function normalizeContactNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\+?[0-9()\-\s]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits.length === 12 && digits.startsWith("63") ? `0${digits.slice(2)}` : digits;
}
