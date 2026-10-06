import { ItemCondition, ItemStatus, ItemType } from "@prisma/client";

import { normalizeHeader } from "./columns";

/**
 * Reading spreadsheet cells forgivingly. A cell that cannot be understood never sinks a whole row:
 * the optional detail is left out and a warning says so. Only the item name is truly required.
 * (The one thing that is refused is an unusable number that would change what is stored, such as
 * a quantity far outside any sensible range.)
 */

/** A problem with one row that is safe and useful to show to staff. */
export class ImportRowError extends Error {}

export type Warn = (message: string) => void;

const monthNumbers: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function dateFrom(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/** Dates as people type them: 2026-01-15, 1/15/2026, 15 Jan 2026, January 15, 2026, or an Excel number. */
export function parseLooseDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(value);
  if (match) {
    return dateFrom(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(value);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    // Month first, as is usual in the Philippines, unless that cannot be a month.
    return first > 12 ? dateFrom(year, second, first) : dateFrom(year, first, second);
  }
  match = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/.exec(value);
  if (match) {
    const month =
      monthNumbers[match[2].slice(0, 4).toLowerCase()] ??
      monthNumbers[match[2].slice(0, 3).toLowerCase()];
    return month ? dateFrom(Number(match[3]), month, Number(match[1])) : null;
  }
  match = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);
  if (match) {
    const month =
      monthNumbers[match[1].slice(0, 4).toLowerCase()] ??
      monthNumbers[match[1].slice(0, 3).toLowerCase()];
    return month ? dateFrom(Number(match[3]), month, Number(match[2])) : null;
  }
  // An unformatted Excel date is a day count from 1899-12-30.
  if (/^\d{5}(?:\.\d+)?$/.test(value)) {
    const serial = Math.floor(Number(value));
    if (serial >= 20_000 && serial <= 80_000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    }
  }
  return null;
}

/** An optional date. An unreadable one is dropped with a warning. */
export function optionalDate(raw: string, field: string, warn: Warn) {
  if (!raw.trim()) {
    return null;
  }
  const date = parseLooseDate(raw);
  if (!date) {
    warn(`${field} “${clip(raw)}” is not a date I could read, so it was left blank.`);
  }
  return date;
}

/** A whole number such as "5", "1,200" or "5 pcs". Blank is the fallback; nonsense is a warning. */
export function looseWholeNumber(
  raw: string,
  fallback: number | null,
  field: string,
  warn: Warn,
  maximum = 1_000_000,
) {
  const value = raw.trim();
  if (!value) {
    return fallback;
  }
  const match = /^(\d[\d,]*)(?:\.0+)?(?:\s*[A-Za-z.]*)?$/.exec(value);
  if (!match) {
    warn(
      `${field} “${clip(value)}” is not a number, so ${fallback === null ? "it was left blank" : `${fallback} was used`}.`,
    );
    return fallback;
  }
  const parsed = Number(match[1].replaceAll(",", ""));
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new ImportRowError(`${field} is outside the allowed range.`);
  }
  return parsed;
}

/** Memory or storage in GB from "8", "8 GB", "512GB" or "1 TB". */
export function looseSizeGb(raw: string, field: string, warn: Warn, maximum = 1_000_000) {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const match = /^(\d+(?:[.,]\d+)?)\s*(tb|t|gb|g|mb|m)?b?$/i.exec(value);
  if (!match) {
    warn(`${field} “${clip(value)}” is not a size I could read, so it was left blank.`);
    return null;
  }
  const unit = (match[2] ?? "gb").toLowerCase();
  const amount = Number(match[1].replace(",", "."));
  const gigabytes = unit.startsWith("t")
    ? amount * 1_024
    : unit.startsWith("m")
      ? amount / 1_024
      : amount;
  const rounded = Math.round(gigabytes);
  if (rounded < 1 && gigabytes > 0) {
    warn(`${field} “${clip(value)}” is under 1 GB, so it was left blank.`);
    return null;
  }
  return Math.min(rounded, maximum);
}

/** A peso amount such as "1200", "1,200.50", "₱1,200" or "PHP 1200". */
export function loosePrice(raw: string, warn: Warn) {
  const value = raw
    .trim()
    .replace(/^(?:php|p|₱|\$)\s*/i, "")
    .replaceAll(",", "")
    .replaceAll(/\s/g, "");
  if (!value) {
    return null;
  }
  if (!/^\d{1,8}(?:\.\d+)?$/.test(value)) {
    warn(`Purchase price “${clip(raw)}” is not an amount I could read, so it was left blank.`);
    return null;
  }
  return Number(value).toFixed(2);
}

const trueWords = new Set(["true", "yes", "y", "1", "x", "✓", "✔", "checked"]);
const falseWords = new Set(["false", "no", "n", "0", "none", "unchecked"]);

export function isYes(value: string) {
  return trueWords.has(value.trim().toLowerCase());
}

export function isNo(value: string) {
  return falseWords.has(value.trim().toLowerCase());
}

function clip(value: string, length = 40) {
  const text = value.trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

const typeWords: Record<string, ItemType> = {
  asset: ItemType.ASSET,
  assets: ItemType.ASSET,
  equipment: ItemType.ASSET,
  hardware: ItemType.ASSET,
  device: ItemType.ASSET,
  tracked: ItemType.ASSET,
  supply: ItemType.SUPPLY,
  supplies: ItemType.SUPPLY,
  stock: ItemType.SUPPLY,
  consumable: ItemType.SUPPLY,
  consumables: ItemType.SUPPLY,
  material: ItemType.SUPPLY,
  materials: ItemType.SUPPLY,
};

/** "Equipment" or "Stock" in whatever words the sheet uses. Blank is a tracked asset. */
export function looseItemType(raw: string, warn: Warn): ItemType {
  const key = normalizeHeader(raw);
  if (!key) {
    return ItemType.ASSET;
  }
  const type = typeWords[key];
  if (!type) {
    warn(`Type “${clip(raw)}” was not recognised, so it was treated as equipment.`);
    return ItemType.ASSET;
  }
  return type;
}

const statusWords: Record<string, ItemStatus> = {
  ok: ItemStatus.OK,
  good: ItemStatus.OK,
  fine: ItemStatus.OK,
  functional: ItemStatus.OK,
  serviceable: ItemStatus.OK,
  available: ItemStatus.OK,
  working: ItemStatus.WORKING,
  operational: ItemStatus.WORKING,
  functioning: ItemStatus.WORKING,
  deployed: ItemStatus.DEPLOYED,
  inuse: ItemStatus.DEPLOYED,
  assigned: ItemStatus.DEPLOYED,
  installed: ItemStatus.DEPLOYED,
  issued: ItemStatus.DEPLOYED,
  defective: ItemStatus.DEFECTIVE,
  broken: ItemStatus.DEFECTIVE,
  damaged: ItemStatus.DEFECTIVE,
  faulty: ItemStatus.DEFECTIVE,
  notworking: ItemStatus.DEFECTIVE,
  underrepair: ItemStatus.DEFECTIVE,
  nottested: ItemStatus.NOT_TESTED,
  untested: ItemStatus.NOT_TESTED,
  unchecked: ItemStatus.NOT_TESTED,
  retired: ItemStatus.RETIRED,
  disposed: ItemStatus.RETIRED,
  condemned: ItemStatus.RETIRED,
  decommissioned: ItemStatus.RETIRED,
  unserviceable: ItemStatus.RETIRED,
  lost: ItemStatus.LOST,
  missing: ItemStatus.LOST,
};

const conditionWords: Record<string, ItemCondition> = {
  excellent: ItemCondition.EXCELLENT,
  new: ItemCondition.EXCELLENT,
  brandnew: ItemCondition.EXCELLENT,
  likenew: ItemCondition.EXCELLENT,
  good: ItemCondition.GOOD,
  ok: ItemCondition.GOOD,
  fine: ItemCondition.GOOD,
  working: ItemCondition.GOOD,
  fair: ItemCondition.FAIR,
  average: ItemCondition.FAIR,
  okay: ItemCondition.FAIR,
  used: ItemCondition.FAIR,
  poor: ItemCondition.POOR,
  bad: ItemCondition.POOR,
  worn: ItemCondition.POOR,
  old: ItemCondition.POOR,
  forrepair: ItemCondition.FOR_REPAIR,
  needsrepair: ItemCondition.FOR_REPAIR,
  repair: ItemCondition.FOR_REPAIR,
  underrepair: ItemCondition.FOR_REPAIR,
  defective: ItemCondition.FOR_REPAIR,
  broken: ItemCondition.FOR_REPAIR,
  damaged: ItemCondition.FOR_REPAIR,
};

/** A status or condition by its name or a common synonym; anything else keeps the fallback. */
export function looseEnum<T extends string>(
  raw: string,
  values: readonly T[],
  synonyms: Record<string, T>,
  fallback: T,
  field: string,
  warn: Warn,
): T {
  const key = normalizeHeader(raw);
  if (!key) {
    return fallback;
  }
  const exact = values.find((value) => normalizeHeader(value) === key);
  const match = exact ?? synonyms[key];
  if (!match) {
    warn(
      `${field} “${clip(raw)}” was not recognised, so “${fallback.replaceAll("_", " ").toLowerCase()}” was used.`,
    );
    return fallback;
  }
  return match;
}

export function looseStatus(raw: string, fallback: ItemStatus, warn: Warn) {
  return looseEnum(raw, Object.values(ItemStatus), statusWords, fallback, "Status", warn);
}

export function looseCondition(raw: string, fallback: ItemCondition, warn: Warn) {
  return looseEnum(raw, Object.values(ItemCondition), conditionWords, fallback, "Condition", warn);
}

/** Rows that are really a total or a repeated heading, not an item. */
export function isSummaryName(name: string) {
  return /^(?:grand\s+)?totals?:?$/i.test(name.trim());
}
