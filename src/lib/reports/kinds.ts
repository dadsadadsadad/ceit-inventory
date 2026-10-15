// no server imports here, used on the client too

export const reportKinds = [
  "overview",
  "inventory",
  "stock",
  "warranty",
  "value",
  "health",
  "pcs",
  "hardware",
  "software",
  "borrowing",
  "maintenance",
  "activity",
] as const;
export type ReportKind = (typeof reportKinds)[number];

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
  | "stockLevel"
  | "warranty"
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
  | "actor"
  | "price"
  | "purchased"
  | "within"
  | "missing";

export type ReportKindInfo = {
  controls: ReportControl[];
  description: string;
  id: ReportKind;
  label: string;
  stem: string;
};

export const reportKindInfo: Record<ReportKind, ReportKindInfo> = {
  overview: {
    id: "overview",
    label: "Overview",
    description: "Totals, loans, repairs and what needs attention.",
    stem: "ceit-overview",
    controls: [],
  },
  inventory: {
    id: "inventory",
    label: "Inventory",
    description: "Equipment and stock with status, condition and location.",
    stem: "ceit-inventory",
    controls: [
      "search",
      "inventoryStatus",
      "condition",
      "category",
      "location",
      "itemType",
      "stockLevel",
      "warranty",
      "pcOnly",
      "attention",
      "price",
      "purchased",
      "missing",
      "dates",
    ],
  },
  stock: {
    id: "stock",
    label: "Stock",
    description: "Stock levels.",
    stem: "ceit-stock",
    controls: ["search", "stockLevel", "category", "location"],
  },
  warranty: {
    id: "warranty",
    label: "Warranty",
    description: "Warranty dates and what's ending.",
    stem: "ceit-warranty",
    controls: [
      "search",
      "warranty",
      "within",
      "category",
      "location",
      "itemType",
      "price",
      "purchased",
    ],
  },
  value: {
    id: "value",
    label: "Asset value",
    description: "Equipment value by category, room and age.",
    stem: "ceit-asset-value",
    controls: [
      "search",
      "inventoryStatus",
      "category",
      "location",
      "itemType",
      "price",
      "purchased",
      "missing",
    ],
  },
  health: {
    id: "health",
    label: "Record health",
    description: "Items missing a price, serial, date, warranty, photo or recent check.",
    stem: "ceit-record-health",
    controls: ["search", "category", "location", "itemType", "missing"],
  },
  pcs: {
    id: "pcs",
    label: "PC register",
    description: "All PCs with hardware, OS and software.",
    stem: "ceit-pc-register",
    controls: ["search", "inventoryStatus", "location", "incomplete", "dates"],
  },
  hardware: {
    id: "hardware",
    label: "Hardware",
    description: "CPU, memory, storage and graphics across PCs.",
    stem: "ceit-hardware",
    controls: ["search", "location", "component", "incomplete", "retired"],
  },
  software: {
    id: "software",
    label: "Software",
    description: "Installed software and license dates.",
    stem: "ceit-software",
    controls: ["search", "location", "license", "within", "retired"],
  },
  borrowing: {
    id: "borrowing",
    label: "Borrowing",
    description: "Requests, reservations, loans and returns.",
    stem: "ceit-borrowing",
    controls: ["search", "borrowingState", "dates"],
  },
  maintenance: {
    id: "maintenance",
    label: "Maintenance",
    description: "Repairs and how long they took.",
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

export const quickReports: {
  description: string;
  label: string;
  query: Record<string, string>;
}[] = [
  {
    label: "Overdue loans",
    description: "Not returned on time.",
    query: { kind: "borrowing", borrowingState: "overdue" },
  },
  {
    label: "Needs attention",
    description: "Defective, untested, poor or in repair.",
    query: { kind: "inventory", attention: "1" },
  },
  {
    label: "Low stock",
    description: "At or below the alert level.",
    query: { kind: "stock", stock: "low" },
  },
  {
    label: "Warranties ending soon",
    description: "Warranty ends within 60 days.",
    query: { kind: "warranty", warranty: "ending" },
  },
  {
    label: "Due back today",
    description: "Due back today.",
    query: { kind: "borrowing", borrowingState: "due-today" },
  },
  {
    label: "Licenses ending soon",
    description: "License ends within 30 days.",
    query: { kind: "software", license: "expiring" },
  },
  {
    label: "PCs missing details",
    description: "No CPU, memory or storage recorded.",
    query: { kind: "hardware", incomplete: "1", component: "processor" },
  },
  {
    label: "Open repairs",
    description: "Not resolved yet.",
    query: { kind: "maintenance", maintenanceStatus: "OPEN" },
  },
  {
    label: "Equipment value",
    description: "Value by category and room.",
    query: { kind: "value" },
  },
  {
    label: "Records missing a price",
    description: "No purchase price recorded.",
    query: { kind: "health", missing: "price" },
  },
  {
    label: "Warranties ending in 90 days",
    description: "Warranties ending soon.",
    query: { kind: "warranty", within: "90" },
  },
  {
    label: "Unlicensed software",
    description: "Free or unlicensed copies.",
    query: { kind: "software", license: "unlicensed" },
  },
  {
    label: "Licenses ending in 90 days",
    description: "Licenses to renew soon.",
    query: { kind: "software", within: "90" },
  },
  {
    label: "Not checked in 90 days",
    description: "Due for a check.",
    query: { kind: "health", missing: "inspection" },
  },
  {
    label: "Last 30 days of borrowing",
    description: "Requests from the past month.",
    query: { kind: "borrowing", period: "last-30-days" },
  },
];
