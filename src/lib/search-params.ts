import { stripControlCharacters } from "./clean-text";

/** A query-string value as Next.js delivers it: absent, one value, or repeated. */
export type RawParam = string | string[] | undefined;

/**
 * The first value when a parameter is repeated, so odd URLs never break a page, with control
 * characters removed so a hand-made address cannot make a page's database query fail.
 */
export function firstParam(value: RawParam) {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined ? undefined : stripControlCharacters(first);
}

/** A positive page number, capped so a huge value cannot request an absurd offset. */
export function pageParam(value: RawParam, maximum = 10_000) {
  const parsed = Number(firstParam(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : 1;
}

/** A trimmed, length-limited search string. */
export function textParam(value: RawParam, maximumLength = 120) {
  return firstParam(value)?.trim().slice(0, maximumLength) ?? "";
}
