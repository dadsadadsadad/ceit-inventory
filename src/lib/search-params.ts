import { stripControlCharacters } from "./clean-text";

export type RawParam = string | string[] | undefined;

// first value if repeated, control chars removed
export function firstParam(value: RawParam) {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined ? undefined : stripControlCharacters(first);
}

// capped so huge values can't make a huge offset
export function pageParam(value: RawParam, max = 10_000) {
  const parsed = Number(firstParam(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : 1;
}

export function textParam(value: RawParam, maxLength = 120) {
  return firstParam(value)?.trim().slice(0, maxLength) ?? "";
}
