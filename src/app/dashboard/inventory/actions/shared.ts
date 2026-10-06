import "server-only";

import { BorrowStatus, ItemCondition, ItemStatus, ItemType, Prisma } from "@prisma/client";

import {
  CustomFieldError,
  customFieldInputName,
  customFieldsFor,
  parseCustomFieldValues,
  readCustomValues,
} from "@/lib/custom-fields";
import { loadCustomFields } from "@/lib/custom-field-queries";
import { isUuid } from "@/lib/ids";
import { FormError } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { isInventoryAssetTag } from "@/lib/asset-tag";
import { manilaCalendarDate } from "@/lib/manila-date";
import { prisma } from "@/prisma";

export { optionalText, requiredText };

export const statuses = Object.values(ItemStatus);
export const conditions = Object.values(ItemCondition);
export const itemTypes = Object.values(ItemType);
export const maximumBulkSelection = 10_000;
/** The most equipment records one "Add" can create at once. */
export const maximumNewUnits = 50;
export const activeBorrowRequestStatuses = [
  BorrowStatus.REQUESTED,
  BorrowStatus.RESERVED,
  BorrowStatus.BORROWED,
  BorrowStatus.RETURN_REQUESTED,
];

// A record ID from a form.
export function requiredId(formData: FormData, key: string) {
  return requiredUuid(formData, key, `Invalid ${key}.`);
}

// Read and validate the selected inventory IDs.
export function selectedIds(formData: FormData) {
  const ids = [
    ...new Set(
      formData
        .getAll("itemIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) {
    throw new FormError("Select at least one inventory record.");
  }
  if (ids.length > maximumBulkSelection) {
    throw new FormError(
      `Update up to ${maximumBulkSelection.toLocaleString()} inventory records at a time.`,
    );
  }
  if (ids.some((id) => !isUuid(id))) {
    throw new FormError("One or more selected inventory records are invalid.");
  }
  return ids;
}

export function identifier(formData: FormData, key: string) {
  return optionalText(formData, key, 255)?.toUpperCase() ?? null;
}

// A date field only carries the calendar day. Keep the recorded time of day when the day is
// unchanged, and use the real time when the chosen day is today (Philippine time).
export function checkedAtFromDate(chosen: Date | null, current?: Date | null) {
  if (!chosen) {
    return null;
  }
  const day = chosen.toISOString().slice(0, 10);
  if (current && manilaCalendarDate(current) === day) {
    return current;
  }
  return manilaCalendarDate() === day ? new Date() : chosen;
}

export function checkedDate(formData: FormData) {
  return checkedAtFromDate(optionalDate(formData, "lastCheckedAt")) ?? new Date();
}

// Keep one record per individually tagged asset.
export function assertTrackedAssetQuantity(
  itemType: ItemType,
  quantity: number,
  existing?: { itemType: ItemType; quantity: number },
) {
  if (itemType !== ItemType.ASSET || quantity === 1) {
    return;
  }
  if (existing?.itemType === ItemType.ASSET && existing.quantity === quantity) {
    return;
  }
  throw new FormError(
    "Track each physical equipment asset as one record so it can keep its own asset tag, QR code, room, and inspection history. Use a supply record for quantity-based stock.",
  );
}

// Check the tag format before writing the item.
export function assertAssetTag(assetTag: string | null, itemType: ItemType) {
  if (itemType === ItemType.ASSET && assetTag && !isInventoryAssetTag(assetTag)) {
    throw new FormError(
      "Asset tags must follow the established INV-CAT-ST-ROOM-0001 format, or leave the field blank to generate the next compatible tag.",
    );
  }
}

// Translate duplicate identifiers into a form error.
export function inventoryWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new FormError(
      "That asset tag, serial number, or PC MAC address is already assigned to another record.",
    );
  }
  return error;
}

export function enumValue<T extends string>(
  formData: FormData,
  key: string,
  values: readonly T[],
  fallback: T,
) {
  const value = optionalText(formData, key, 64);
  if (!value) {
    return fallback;
  }
  if (!values.includes(value as T)) {
    throw new FormError(`Invalid ${key}.`);
  }
  return value as T;
}

export function optionalInteger(formData: FormData, key: string, maximum = 1_000_000) {
  const value = optionalText(formData, key, 32);
  if (!value) {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    throw new FormError(`${key} must be a non-negative whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new FormError(`${key} is outside the allowed range.`);
  }
  return parsed;
}

// Accept a price with at most two decimal places.
export function optionalPurchasePrice(formData: FormData, key = "purchasePrice") {
  const value = optionalText(formData, key, 32);
  if (!value) {
    return null;
  }
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
    throw new FormError(
      "Purchase price must be a non-negative Philippine peso amount with up to two decimal places.",
    );
  }
  const [whole, decimal = ""] = value.split(".");
  return new Prisma.Decimal(`${whole}.${decimal.padEnd(2, "0")}`).toString();
}

export function optionalDate(formData: FormData, key: string) {
  const value = optionalText(formData, key, 10);
  if (!value) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FormError(`${key} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new FormError(`${key} is not a valid date.`);
  }
  return parsed;
}

// Stock records can set their own alert level. Empty means the default; equipment has none.
export function readLowStockThreshold(formData: FormData, itemType: ItemType) {
  if (itemType !== ItemType.SUPPLY) {
    return null;
  }
  return optionalInteger(formData, "lowStockThreshold", 1_000_000);
}

// Read the custom field answers that apply to this item. Answers for fields that do not apply
// (for example after a category change) are kept as they were; cleared answers are removed.
export async function readItemCustomFields(
  formData: FormData,
  item: { categoryId: string; itemType: ItemType },
  existing?: unknown,
) {
  const applicable = customFieldsFor(await loadCustomFields(), item);
  const kept = readCustomValues(existing);
  for (const field of applicable) {
    delete kept[field.id];
  }
  let answers;
  try {
    answers = parseCustomFieldValues(applicable, (name) => formData.get(name));
  } catch (error) {
    if (error instanceof CustomFieldError) {
      throw new FormError(error.message);
    }
    throw error;
  }
  const merged = { ...kept, ...answers };
  return Object.keys(merged).length ? (merged as Prisma.InputJsonObject) : Prisma.DbNull;
}

export { customFieldInputName };

// "yes" or "no" from a select; empty means nobody said.
export function optionalYesNo(formData: FormData, key: string) {
  const value = optionalText(formData, key, 8);
  if (!value) {
    return null;
  }
  if (value !== "yes" && value !== "no") {
    throw new FormError(`${key} must be yes or no.`);
  }
  return value === "yes";
}

// Computer form values.
export function computerData(formData: FormData, includeCheckTime = false) {
  return {
    operatingSystem: optionalText(formData, "operatingSystem", 255),
    osVersion: optionalText(formData, "osVersion", 255),
    processor: optionalText(formData, "processor", 255),
    memoryGb: optionalInteger(formData, "memoryGb", 16_384),
    storageGb: optionalInteger(formData, "storageGb", 1_000_000),
    storageType: optionalText(formData, "storageType", 255),
    graphics: optionalText(formData, "graphics", 255),
    macAddress: identifier(formData, "macAddress"),
    ipAddress: optionalText(formData, "ipAddress", 255),
    hardwareDescription: optionalText(formData, "hardwareDescription", 5_000),
    softwareDescription: optionalText(formData, "softwareDescription", 5_000),
    ...(includeCheckTime ? { lastCheckedAt: new Date() } : {}),
  };
}

// Allow only active categories and rooms for new assignments.
export async function assertActiveAssignments(
  categoryId: string,
  locationId: string,
  current?: { categoryId: string; locationId: string },
) {
  const [category, location] = await Promise.all([
    categoryId === current?.categoryId
      ? Promise.resolve(true)
      : prisma.category.findFirst({
          where: { id: categoryId, isActive: true },
          select: { id: true },
        }),
    locationId === current?.locationId
      ? Promise.resolve(true)
      : prisma.location.findFirst({
          where: { id: locationId, isActive: true },
          select: { id: true },
        }),
  ]);
  if (!category) {
    throw new FormError("Choose an active item category.");
  }
  if (!location) {
    throw new FormError("Choose an active location.");
  }
}

// Verify that these computer details belong to the item.
export async function requireComputerForItem(itemId: string, computerId: string) {
  const computer = await prisma.computer.findFirst({ where: { id: computerId, itemId } });
  if (!computer) {
    throw new FormError("The PC record does not belong to this inventory item.");
  }
  return computer;
}

// Collect changed values for the audit trail.
export function updatedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Prisma.InputJsonObject {
  const text = (value: unknown) =>
    value === Prisma.DbNull
      ? ""
      : value !== null && typeof value === "object" && !(value instanceof Date)
        ? JSON.stringify(value)
        : String(value ?? "");
  const entries = Object.entries(after)
    .filter(([key, value]) => text(before[key]) !== text(value))
    .map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : value === undefined || value === Prisma.DbNull
          ? null
          : (value as string | number | boolean | null),
    ]);
  return Object.fromEntries(entries) as Prisma.InputJsonObject;
}
