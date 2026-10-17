// keys are the layout= param, compact and large are the old ones
export const labelLayouts = {
  small: { name: "Small 2 cm · 40 per sheet", perPage: 40 },
  compact: { name: "Medium 2.4 cm · 24 per sheet", perPage: 24 },
  large: { name: "Large 3.5 cm · 8 per sheet", perPage: 8 },
  poster: { name: "Extra large 9 cm · 2 per sheet", perPage: 2 },
} as const;

export type LabelLayout = keyof typeof labelLayouts;

export const defaultLabelLayout: LabelLayout = "compact";

export function labelLayoutOf(value: string | null | undefined): LabelLayout {
  return value && Object.hasOwn(labelLayouts, value) ? (value as LabelLayout) : defaultLabelLayout;
}

export const maxLabelCount = 100;
// select all keeps the filters in the url instead of ids, so it can go higher
export const maxAllLabels = 500;

export function labelPages<T>(items: T[], perPage: number): T[][] {
  if (!Number.isInteger(perPage) || perPage < 1) {
    throw new Error("Invalid label layout.");
  }
  return Array.from({ length: Math.ceil(items.length / perPage) }, (_, page) =>
    items.slice(page * perPage, (page + 1) * perPage),
  );
}

// ids=a,b or repeated ids=
export function selectedLabelIds(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      values
        .flatMap((entry) => entry.split(","))
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}
