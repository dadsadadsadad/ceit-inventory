import { ItemStatus, PrismaClient } from "@prisma/client";

export const inventoryAssetTagPattern = /^INV-([A-Z0-9]{3})-([A-Z]{2})-(\d{2})-(\d{4})$/;

const statusCodes: Record<ItemStatus, string> = {
  [ItemStatus.OK]: "OK",
  [ItemStatus.WORKING]: "WK",
  [ItemStatus.DEPLOYED]: "DP",
  [ItemStatus.DEFECTIVE]: "DF",
  [ItemStatus.NOT_TESTED]: "NT",
  [ItemStatus.RETIRED]: "RT",
  [ItemStatus.LOST]: "LS",
};

type AssetTagClient = Pick<PrismaClient, "category" | "inventoryItem" | "location">;

function cleanedCode(value: string) {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "");
}

export function isInventoryAssetTag(value: string) {
  return inventoryAssetTagPattern.test(value.trim().toUpperCase());
}

export function normalizeAssetTagCode(value: string, length: number) {
  const code = cleanedCode(value);
  return code.length === length ? code : null;
}

export function deriveAssetTagCode(name: string, length: number) {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const initials = words.map((word) => word[0]).join("");
  const compact = words.join("");
  return `${initials}${compact}`.slice(0, length).padEnd(length, "X");
}

export function nextCategoryAssetTagCode(name: string, usedCodes: Iterable<string | null | undefined>) {
  const used = new Set([...usedCodes].map((code) => code?.toUpperCase()).filter((code): code is string => Boolean(code)));
  const base = deriveAssetTagCode(name, 3);
  if (!used.has(base)) return base;

  for (let sequence = 1; sequence <= 99; sequence += 1) {
    const candidate = sequence < 10 ? `${base.slice(0, 2)}${sequence}` : `${base[0]}${String(sequence).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No category asset-tag code is available. Enter a different three-character code.");
}

export function nextLocationAssetTagCode(usedCodes: Iterable<string | null | undefined>) {
  const used = new Set([...usedCodes].map((code) => code?.toUpperCase()).filter((code): code is string => Boolean(code)));
  for (let sequence = 1; sequence <= 99; sequence += 1) {
    const candidate = String(sequence).padStart(2, "0");
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No room asset-tag code is available. Enter a different two-digit code.");
}

export function assetTagPrefix(categoryCode: string, status: ItemStatus, locationCode: string) {
  const normalizedCategory = normalizeAssetTagCode(categoryCode, 3);
  const normalizedLocation = normalizeAssetTagCode(locationCode, 2);
  if (!normalizedCategory || !normalizedLocation || !/^\d{2}$/.test(normalizedLocation)) throw new Error("The category or room asset-tag code is not configured correctly.");
  return `INV-${normalizedCategory}-${statusCodes[status]}-${normalizedLocation}-`;
}

export function assetTagSequence(assetTag: string, prefix: string) {
  if (!assetTag.startsWith(prefix)) return null;
  const value = assetTag.slice(prefix.length);
  return /^\d{4}$/.test(value) ? Number(value) : null;
}

export async function nextInventoryAssetTag(client: AssetTagClient, values: { categoryId: string; locationId: string; status: ItemStatus }) {
  const [category, location] = await Promise.all([
    client.category.findUnique({ where: { id: values.categoryId }, select: { assetTagCode: true } }),
    client.location.findUnique({ where: { id: values.locationId }, select: { assetTagCode: true } }),
  ]);
  if (!category?.assetTagCode || !location?.assetTagCode) throw new Error("This category or room needs an asset-tag code in Settings before equipment can be added.");

  const prefix = assetTagPrefix(category.assetTagCode, values.status, location.assetTagCode);
  const matches = await client.inventoryItem.findMany({ where: { assetTag: { startsWith: prefix } }, select: { assetTag: true } });
  const maximumSequence = Math.max(0, ...matches.map((item) => item.assetTag ? assetTagSequence(item.assetTag, prefix) ?? 0 : 0));
  if (maximumSequence >= 9_999) throw new Error(`No more asset-tag numbers are available for ${prefix}.`);
  return `${prefix}${String(maximumSequence + 1).padStart(4, "0")}`;
}
