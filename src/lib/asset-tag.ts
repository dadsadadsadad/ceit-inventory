import type { PrismaClient } from "@prisma/client";

import { normalizeTagCode } from "./asset-tag-code";
import { FormError } from "./form-error";

// <category>-<room>-<number>, e.g. ROBOT-MIKRO-0001. status is left out so tags never change
export const inventoryAssetTagPattern = /^([A-Z0-9]{2,6})-([A-Z0-9]{2,6})-(\d{4})$/;

type AssetTagClient = Pick<PrismaClient, "category" | "inventoryItem" | "location">;

export function isInventoryAssetTag(value: string) {
  return inventoryAssetTagPattern.test(value.trim().toUpperCase());
}

export function assetTagPrefix(categoryCode: string, locationCode: string) {
  const category = normalizeTagCode(categoryCode);
  const room = normalizeTagCode(locationCode);
  if (!category || !room) {
    throw new Error("The category or room code is invalid.");
  }
  return `${category}-${room}-`;
}

export function assetTagSequence(assetTag: string, prefix: string) {
  if (!assetTag.startsWith(prefix)) {
    return null;
  }
  const value = assetTag.slice(prefix.length);
  return /^\d{4}$/.test(value) ? Number(value) : null;
}

export async function nextInventoryAssetTag(
  client: AssetTagClient,
  values: { categoryId: string; locationId: string },
) {
  const [category, location] = await Promise.all([
    client.category.findUnique({
      where: { id: values.categoryId },
      select: { assetTagCode: true },
    }),
    client.location.findUnique({
      where: { id: values.locationId },
      select: { assetTagCode: true },
    }),
  ]);
  if (!category?.assetTagCode || !location?.assetTagCode) {
    throw new FormError("Set a code for this category or room in Rooms and categories first.");
  }

  const prefix = assetTagPrefix(category.assetTagCode, location.assetTagCode);
  const matches = await client.inventoryItem.findMany({
    where: { assetTag: { startsWith: prefix } },
    select: { assetTag: true },
  });
  // next number after the highest one with this prefix
  const maxSequence = Math.max(
    0,
    ...matches.map((item) => (item.assetTag ? (assetTagSequence(item.assetTag, prefix) ?? 0) : 0)),
  );
  if (maxSequence >= 9_999) {
    throw new Error(`No tag numbers left for ${prefix}.`);
  }
  return `${prefix}${String(maxSequence + 1).padStart(4, "0")}`;
}
