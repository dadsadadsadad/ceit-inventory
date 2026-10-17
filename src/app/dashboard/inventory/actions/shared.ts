import "server-only";

import {
  BorrowStatus,
  CustomFieldType,
  ItemCondition,
  ItemStatus,
  ItemType,
  Prisma,
} from "@prisma/client";

import { auditEventData } from "@/lib/audit-event";
import {
  CustomFieldError,
  customFieldInputName,
  customFieldsFor,
  maxCustomFields,
  parseCustomFieldValues,
  readCustomValues,
  validatedChoices,
  type CustomFieldValues,
} from "@/lib/custom-fields";
import type { InventoryUser } from "@/lib/inventory-auth";
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
export const maxBulkSelection = 10_000;
// max units per add
export const maxNewUnits = 50;
export const activeBorrowRequestStatuses = [
  BorrowStatus.REQUESTED,
  BorrowStatus.RESERVED,
  BorrowStatus.BORROWED,
  BorrowStatus.RETURN_REQUESTED,
];

export function requiredId(formData: FormData, key: string) {
  return requiredUuid(formData, key, `Invalid ${key}.`);
}

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
    throw new FormError("Select at least one item.");
  }
  if (ids.length > maxBulkSelection) {
    throw new FormError(
      `Update up to ${maxBulkSelection.toLocaleString()} inventory records at a time.`,
    );
  }
  if (ids.some((id) => !isUuid(id))) {
    throw new FormError("Invalid selection.");
  }
  return ids;
}

export function identifier(formData: FormData, key: string) {
  return optionalText(formData, key, 255)?.toUpperCase() ?? null;
}

// date inputs have no time, keep the old time if the day didn't change, use now if it's today
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
    "Equipment is one record per unit. Use stock for things counted by quantity.",
  );
}

export function assertAssetTag(assetTag: string | null, itemType: ItemType) {
  if (itemType === ItemType.ASSET && assetTag && !isInventoryAssetTag(assetTag)) {
    throw new FormError("Use the CATEGORY-ROOM-0001 format, or leave it blank to generate one.");
  }
}

// unique constraint errors -> form errors
export function inventoryWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new FormError("That tag, serial number or MAC address is already used.");
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

export function optionalInteger(formData: FormData, key: string, max = 1_000_000) {
  const value = optionalText(formData, key, 32);
  if (!value) {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    throw new FormError(`${key} must be a whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new FormError(`${key} is outside the allowed range.`);
  }
  return parsed;
}

// max 2 decimal places
export function optionalPurchasePrice(formData: FormData, key = "purchasePrice") {
  const value = optionalText(formData, key, 32);
  if (!value) {
    return null;
  }
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
    throw new FormError("Enter a valid price, e.g. 1200 or 1200.50.");
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

// stock only, empty = default
export function readLowStockThreshold(formData: FormData, itemType: ItemType) {
  if (itemType !== ItemType.SUPPLY) {
    return null;
  }
  return optionalInteger(formData, "lowStockThreshold", 1_000_000);
}

// answers for fields that don't apply anymore are kept, cleared ones are removed
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

export type InlineCustomField = {
  answer: string;
  choices: string[];
  fieldType: CustomFieldType;
  label: string;
};

// only reads the new field here, it's created later in the item transaction
export function readInlineCustomField(formData: FormData): InlineCustomField | null {
  const label = String(formData.get("newFieldLabel") ?? "").trim();
  if (!label) {
    return null;
  }
  if (label.length > 60) {
    throw new FormError("Field names can be up to 60 characters.");
  }
  const fieldType = String(formData.get("newFieldType") ?? "TEXT") as CustomFieldType;
  if (!Object.values(CustomFieldType).includes(fieldType)) {
    throw new FormError("Pick a field type.");
  }
  let choices: string[];
  try {
    choices = validatedChoices(fieldType, String(formData.get("newFieldChoices") ?? ""));
  } catch (error) {
    throw new FormError(error instanceof Error ? error.message : "Check the field's options.");
  }
  return {
    answer: String(formData.get("newFieldValue") ?? "").trim(),
    choices,
    fieldType,
    label,
  };
}

// runs inside the item transaction so both save together
export async function addInlineCustomField(
  tx: Prisma.TransactionClient,
  request: InlineCustomField,
  actor: InventoryUser,
): Promise<CustomFieldValues> {
  const existing = await tx.customField.findMany({ select: { label: true } });
  if (existing.length >= maxCustomFields) {
    throw new FormError(`You can add up to ${maxCustomFields} extra fields.`);
  }
  if (existing.some((field) => field.label.toLowerCase() === request.label.toLowerCase())) {
    throw new FormError(`There's already a field called "${request.label}".`);
  }
  const field = await tx.customField.create({
    data: {
      choices: request.choices,
      fieldType: request.fieldType,
      label: request.label,
      sortOrder: existing.length,
    },
  });
  await tx.inventoryAudit.create({
    data: auditEventData({
      action: "CREATED",
      actor,
      entity: { id: field.id, label: field.label, type: "custom-field" },
      metadata: { activityKind: "configuration", fieldType: request.fieldType },
      summary: "Extra field created.",
    }),
  });
  try {
    return parseCustomFieldValues([{ ...field, appliesTo: null, categoryId: null }], (name) =>
      name === customFieldInputName(field.id) ? request.answer : null,
    );
  } catch (error) {
    if (error instanceof CustomFieldError) {
      throw new FormError(error.message);
    }
    throw error;
  }
}

export function withInlineAnswers(
  base: Prisma.InputJsonObject | typeof Prisma.DbNull,
  inline: CustomFieldValues,
) {
  if (!Object.keys(inline).length) {
    return base;
  }
  return { ...(base === Prisma.DbNull ? {} : base), ...inline } as Prisma.InputJsonObject;
}

// "yes" / "no" / empty
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

// only active categories and rooms can be assigned
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
    throw new FormError("Pick an active category.");
  }
  if (!location) {
    throw new FormError("Choose an active location.");
  }
}

// make sure the computer belongs to this item
export async function requireComputerForItem(itemId: string, computerId: string) {
  const computer = await prisma.computer.findFirst({ where: { id: computerId, itemId } });
  if (!computer) {
    throw new FormError("This PC record belongs to a different item.");
  }
  return computer;
}

// changed fields for the audit log
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
