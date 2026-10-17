// no server imports here, the dashboard editor uses it too

export const widgetSizes = [
  { id: "narrow", label: "Narrow", span: 3 },
  { id: "normal", label: "Normal", span: 4 },
  { id: "roomy", label: "Roomy", span: 5 },
  { id: "half", label: "Half", span: 6 },
  { id: "wide", label: "Wide", span: 8 },
  { id: "full", label: "Full width", span: 12 },
] as const;

export type WidgetSize = (typeof widgetSizes)[number]["id"];
export type WidgetZone = "main" | "side";

export const dashboardWidgets = [
  {
    id: "metrics",
    label: "Headline numbers",
    description: "Records, ready to lend, on loan, open repairs, needs attention.",
    size: "full",
    zone: "main",
    visible: true,
  },
  {
    id: "status",
    label: "Inventory status",
    description: "Donut of items by status.",
    size: "narrow",
    zone: "main",
    visible: true,
  },
  {
    id: "borrowing",
    label: "Borrowing",
    description: "Requests, overdue, due today and requests per month.",
    size: "normal",
    zone: "main",
    visible: true,
    manageOnly: true,
  },
  {
    id: "attention",
    label: "Needs attention",
    description: "Defective, untested, old PCs, unchecked, warranty and stock.",
    size: "roomy",
    zone: "main",
    visible: true,
  },
  {
    id: "byCategory",
    label: "Items by category",
    description: "Top categories by number of items.",
    size: "half",
    zone: "main",
    visible: true,
  },
  {
    id: "byRoom",
    label: "Items by room",
    description: "Top rooms by number of items.",
    size: "half",
    zone: "main",
    visible: true,
  },
  {
    id: "repairs",
    label: "Repairs",
    description: "Open repairs by priority and average time to fix.",
    size: "normal",
    zone: "main",
    visible: false,
    manageOnly: true,
  },
  {
    id: "mostBorrowed",
    label: "Most borrowed",
    description: "Equipment borrowed most in the last 90 days.",
    size: "normal",
    zone: "main",
    visible: false,
    manageOnly: true,
  },
  {
    id: "pcAge",
    label: "PC age",
    description: "PCs by years since purchase.",
    size: "normal",
    zone: "main",
    visible: false,
  },
  {
    id: "quickActions",
    label: "Quick actions",
    description: "Shortcuts to add items, scan, print labels and reports.",
    size: "normal",
    zone: "main",
    visible: false,
  },
  {
    id: "overdueList",
    label: "Overdue loans",
    description: "Who still has equipment past the return time.",
    size: "half",
    zone: "main",
    visible: false,
    manageOnly: true,
  },
  {
    id: "dueSoon",
    label: "Due this week",
    description: "Returns and pickups in the next 7 days.",
    size: "half",
    zone: "main",
    visible: false,
    manageOnly: true,
  },
  {
    id: "lowStockList",
    label: "Low stock items",
    description: "Supplies at or below their alert level.",
    size: "normal",
    zone: "main",
    visible: false,
  },
  {
    id: "openRepairs",
    label: "Open repairs list",
    description: "The newest repairs still open.",
    size: "half",
    zone: "main",
    visible: false,
    manageOnly: true,
  },
  {
    id: "warrantyList",
    label: "Warranties ending",
    description: "Equipment whose warranty ends soon.",
    size: "normal",
    zone: "main",
    visible: false,
  },
  {
    id: "licenseList",
    label: "Licenses ending",
    description: "Software licenses ending in the next 30 days.",
    size: "normal",
    zone: "main",
    visible: false,
  },
  {
    id: "recentItems",
    label: "Recently added",
    description: "The latest items added to the inventory.",
    size: "normal",
    zone: "main",
    visible: false,
  },
  {
    id: "roomChecks",
    label: "Room checks",
    description: "Share of each room's PCs checked in the last 30 days.",
    size: "half",
    zone: "main",
    visible: false,
  },
  {
    id: "assetValue",
    label: "Asset value",
    description: "Value of equipment in use, by category.",
    size: "half",
    zone: "main",
    visible: false,
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Returns, pickups, events and dates ending.",
    size: "full",
    zone: "side",
    visible: true,
  },
  {
    id: "note",
    label: "Department note",
    description: "Shared note for the team.",
    size: "full",
    zone: "side",
    visible: true,
  },
  {
    id: "activity",
    label: "Recent activity",
    description: "The latest changes from the audit trail.",
    size: "full",
    zone: "side",
    visible: false,
    manageOnly: true,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  size: WidgetSize;
  zone: WidgetZone;
  visible: boolean;
  manageOnly?: boolean;
}[];

export type WidgetId = (typeof dashboardWidgets)[number]["id"];
export type WidgetSetting = { id: WidgetId; visible: boolean; zone: WidgetZone; size: WidgetSize };

export function widgetInfo(id: WidgetId) {
  return dashboardWidgets.find((widget) => widget.id === id)!;
}

export function widgetSpan(size: WidgetSize) {
  return widgetSizes.find((entry) => entry.id === size)?.span ?? 12;
}

export function defaultLayout(): WidgetSetting[] {
  return dashboardWidgets.map(({ id, visible, zone, size }) => ({ id, visible, zone, size }));
}

const isSize = (value: unknown): value is WidgetSize =>
  widgetSizes.some((entry) => entry.id === value);

// saved layouts can be old or hand edited, keep what makes sense and add new widgets at the end
export function normalizeLayout(raw: unknown): WidgetSetting[] {
  const defaults = defaultLayout();
  if (!Array.isArray(raw)) {
    return defaults;
  }
  const seen = new Set<string>();
  const saved: WidgetSetting[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const { id, visible, zone, size } = entry as Record<string, unknown>;
    const known = defaults.find((widget) => widget.id === id);
    if (!known || seen.has(known.id)) {
      continue;
    }
    seen.add(known.id);
    saved.push({
      id: known.id,
      visible: typeof visible === "boolean" ? visible : known.visible,
      zone: zone === "main" || zone === "side" ? zone : known.zone,
      size: isSize(size) ? size : known.size,
    });
  }
  return [...saved, ...defaults.filter((widget) => !seen.has(widget.id))];
}

// staff without management access never see borrowing and repair widgets
export function layoutFor(raw: unknown, canManage: boolean) {
  return normalizeLayout(raw).filter(
    (widget) => canManage || !("manageOnly" in widgetInfo(widget.id)),
  );
}
