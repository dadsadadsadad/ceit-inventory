export const labelLayouts = {
  compact: { name: "24 per A4 sheet", perPage: 24 },
  large: { name: "8 per A4 sheet", perPage: 8 },
} as const;
export const maximumLabelCount = 100;
export function labelPages<T>(items: T[], perPage: number): T[][] {
  if (!Number.isInteger(perPage) || perPage < 1) throw new Error("Invalid label layout.");
  return Array.from({ length: Math.ceil(items.length / perPage) }, (_, page) => items.slice(page * perPage, (page + 1) * perPage));
}
