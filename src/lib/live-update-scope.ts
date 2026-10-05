// A change elsewhere in the workspace should not refresh the page being read.
export const liveScopeTables = {
  dashboard: [
    "InventoryItem",
    "Location",
    "BorrowRequest",
    "MaintenanceTicket",
    "DashboardNote",
    "InventoryAudit",
  ],
  inventory: ["InventoryItem", "Category", "Location", "Computer"],
  directory: ["InventoryItem", "Location", "Computer", "ComputerSoftware"],
  item: [
    "InventoryItem",
    "Category",
    "Location",
    "Computer",
    "ComputerSoftware",
    "BorrowRequest",
    "MaintenanceTicket",
    "InventoryItemPhoto",
    "InventoryAudit",
  ],
  setup: ["Category", "Location"],
  labels: ["InventoryItem", "Category", "Location"],
  borrowing: ["InventoryItem", "BorrowRequest"],
  maintenance: ["InventoryItem", "MaintenanceTicket"],
  reports: ["InventoryItem", "Category", "Location", "BorrowRequest", "MaintenanceTicket"],
  activity: ["InventoryAudit", "InventoryItem"],
  settings: ["Category", "Location", "InventoryItem"],
  users: ["User"],
} as const;

export type LiveUpdateScope = keyof typeof liveScopeTables;

export function isLiveUpdateScope(value: string): value is LiveUpdateScope {
  return Object.hasOwn(liveScopeTables, value);
}

export function liveUpdateScope(pathname: string): LiveUpdateScope | null {
  const path = pathname.replace(/\/$/, "");
  if (path === "/dashboard") {
    return "dashboard";
  }
  if (path === "/dashboard/inventory/new" || path === "/dashboard/inventory/import") {
    return "setup";
  }
  if (path === "/dashboard/inventory/labels") {
    return "labels";
  }
  if (path === "/dashboard/inventory/hardware" || path === "/dashboard/inventory/software") {
    return "directory";
  }
  if (/^\/dashboard\/inventory\/[^/]+(?:\/label)?$/.test(path)) {
    return "item";
  }
  const section = path.match(/^\/dashboard\/([^/]+)$/)?.[1];
  return section && isLiveUpdateScope(section) ? section : null;
}
