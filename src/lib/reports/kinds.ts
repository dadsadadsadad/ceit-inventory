/** The reports staff can generate, and which filters each one understands. Safe to import anywhere. */

export const reportKinds = [
  "overview",
  "inventory",
  "pcs",
  "hardware",
  "software",
  "borrowing",
  "maintenance",
  "activity",
] as const;
export type ReportKind = (typeof reportKinds)[number];

/** The filter controls the report builder shows for a report. */
export type ReportControl =
  | "dates"
  | "search"
  | "inventoryStatus"
  | "condition"
  | "category"
  | "location"
  | "itemType"
  | "pcOnly"
  | "attention"
  | "incomplete"
  | "retired"
  | "component"
  | "license"
  | "borrowingState"
  | "maintenanceSource"
  | "maintenanceStatus"
  | "maintenancePriority"
  | "auditView"
  | "action"
  | "actor";

export type ReportKindInfo = {
  controls: ReportControl[];
  description: string;
  id: ReportKind;
  label: string;
  /** The download file name without the date. */
  stem: string;
};

export const reportKindInfo: Record<ReportKind, ReportKindInfo> = {
  overview: {
    id: "overview",
    label: "Overview",
    description: "Where everything stands today: totals, what needs attention, loans, repairs.",
    stem: "ceit-overview",
    controls: [],
  },
  inventory: {
    id: "inventory",
    label: "Inventory",
    description: "Equipment and supplies with their status, condition, and where they are kept.",
    stem: "ceit-inventory",
    controls: [
      "search",
      "inventoryStatus",
      "condition",
      "category",
      "location",
      "itemType",
      "pcOnly",
      "attention",
      "dates",
    ],
  },
  pcs: {
    id: "pcs",
    label: "PC register",
    description: "One entry per PC with its hardware, system, and installed software.",
    stem: "ceit-pc-register",
    controls: ["search", "inventoryStatus", "location", "incomplete", "dates"],
  },
  hardware: {
    id: "hardware",
    label: "Hardware",
    description:
      "Processors, memory, storage, and graphics across your PCs, and which PCs share them.",
    stem: "ceit-hardware",
    controls: ["search", "location", "component", "incomplete", "retired"],
  },
  software: {
    id: "software",
    label: "Software",
    description: "Every installed program, which PCs have it, and when licenses end.",
    stem: "ceit-software",
    controls: ["search", "location", "license", "retired"],
  },
  borrowing: {
    id: "borrowing",
    label: "Borrowing",
    description: "Requests, reservations, loans, and returns, including what is overdue.",
    stem: "ceit-borrowing",
    controls: ["search", "borrowingState", "dates"],
  },
  maintenance: {
    id: "maintenance",
    label: "Maintenance",
    description: "Reported problems and repairs, and how long they stayed open.",
    stem: "ceit-maintenance",
    controls: ["search", "maintenanceStatus", "maintenancePriority", "maintenanceSource", "dates"],
  },
  activity: {
    id: "activity",
    label: "Audit trail",
    description: "Who changed what, and when.",
    stem: "ceit-audit-trail",
    controls: ["search", "auditView", "action", "actor", "dates"],
  },
};

export function isReportKind(value: string | null | undefined): value is ReportKind {
  return reportKinds.includes(value as ReportKind);
}

/** One-click reports that answer common questions. They open the builder already filled in. */
export const quickReports: {
  description: string;
  label: string;
  query: Record<string, string>;
}[] = [
  {
    label: "Overdue loans",
    description: "Everything that should already be back.",
    query: { kind: "borrowing", borrowingState: "overdue" },
  },
  {
    label: "Needs attention",
    description: "Defective, untested, poor, or waiting for repair.",
    query: { kind: "inventory", attention: "1" },
  },
  {
    label: "Licenses ending soon",
    description: "Software whose license ends within 30 days.",
    query: { kind: "software", license: "expiring" },
  },
  {
    label: "PCs missing details",
    description: "PCs without a processor, memory, or storage recorded.",
    query: { kind: "hardware", incomplete: "1", component: "processor" },
  },
  {
    label: "Open repairs",
    description: "Problems nobody has resolved yet.",
    query: { kind: "maintenance", maintenanceStatus: "OPEN" },
  },
  {
    label: "Last 30 days of borrowing",
    description: "Every request in the past month.",
    query: { kind: "borrowing", period: "last-30-days" },
  },
];
