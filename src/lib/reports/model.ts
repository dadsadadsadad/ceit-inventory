import type { ReportKind } from "./kinds";

// the page, pdf and csv all render from this

export type ReportColumn = {
  align?: "right";
  label: string;
  // bold the first line
  primary?: boolean;
  // pdf only
  width: number;
};

export type ReportTable = {
  columns: ReportColumn[];
  emptyText: string;
  heading: string;
  note?: string;
  // \n starts a smaller second line
  rows: string[][];
  // can be more than rows.length when trimmed
  total: number;
};

export type ReportMetric = {
  label: string;
  note?: string;
  tone?: "alert";
  value: string;
};

// same colors as the dashboard status bar
export type ReportChartTone =
  "ok" | "working" | "deployed" | "defective" | "not_tested" | "retired" | "lost";

// bars for categories, columns for time
export type ReportChart = {
  data: { label: string; tone?: ReportChartTone; value: number }[];
  format?: "count" | "peso";
  kind: "bars" | "columns";
  note?: string;
  title: string;
  // plural, used in hover text
  unit: string;
};

export type ReportModel = {
  charts?: ReportChart[];
  // includes header row, falls back to the tables
  csv?: unknown[][];
  description: string;
  // empty = no filters
  filters: string[];
  generatedAt: Date;
  kind: ReportKind;
  metrics: ReportMetric[];
  // adds -filtered to the file name
  narrowed?: boolean;
  tables: ReportTable[];
  title: string;
};

export class ReportRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 413 = 400,
  ) {
    super(message);
    this.name = "ReportRequestError";
  }
}

export type ReportPurpose = "csv" | "pdf" | "preview";

export const reportRowLimits: Record<ReportPurpose, number> = {
  csv: 10_000,
  pdf: 2_000,
  preview: 500,
};

// downloads throw instead of cutting
export function capRows<T>(rows: T[], purpose: ReportPurpose, noun = "records") {
  const limit = reportRowLimits[purpose];
  if (rows.length <= limit) {
    return { rows, total: rows.length };
  }
  if (purpose === "preview") {
    return { rows: rows.slice(0, limit), total: rows.length };
  }
  throw new ReportRequestError(
    `This ${purpose === "csv" ? "CSV" : "PDF"} would hold more than ${limit.toLocaleString()} ${noun}. Narrow the filters or download the CSV instead.`,
    413,
  );
}

export function csvRows(report: ReportModel): unknown[][] {
  if (report.csv) {
    return report.csv;
  }
  const rows: unknown[][] = [["Section", "Record", "Details"]];
  for (const table of report.tables) {
    for (const [first = "", ...rest] of table.rows) {
      rows.push([table.heading, oneLine(first), oneLine(rest.join(" · "))]);
    }
  }
  return rows;
}

function oneLine(cell: string) {
  return cell.replace(/\s*\n\s*/g, " · ");
}

export function reportFilename(stem: string, date: string, filtered: boolean, extension: string) {
  return `${stem}${filtered ? "-filtered" : ""}-${date}.${extension}`;
}
