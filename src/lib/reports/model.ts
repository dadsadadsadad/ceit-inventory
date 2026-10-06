import type { ReportKind } from "./kinds";

/** A report is plain data. The page, the PDF, and the CSV file are all drawn from the same model. */

export type ReportColumn = {
  align?: "right";
  label: string;
  /** Emphasise the first line of each cell, which usually names the record. */
  primary?: boolean;
  /** Relative width in the PDF; the page lets the browser decide. */
  width: number;
};

export type ReportTable = {
  columns: ReportColumn[];
  emptyText: string;
  heading: string;
  note?: string;
  /** Cells are plain text; a new line starts a smaller second line. */
  rows: string[][];
  /** How many rows exist in total. More than `rows.length` when the preview is trimmed. */
  total: number;
};

export type ReportMetric = {
  label: string;
  note?: string;
  /** `alert` marks numbers staff should act on, such as overdue loans. */
  tone?: "alert";
  value: string;
};

export type ReportModel = {
  /** Spreadsheet rows including the header row. Reports without their own fall back to the tables. */
  csv?: unknown[][];
  description: string;
  /** What the report is limited to, in words: "Status: Defective". Empty means no filters. */
  filters: string[];
  generatedAt: Date;
  kind: ReportKind;
  metrics: ReportMetric[];
  /** Whether the report is narrower than its default, which adds "-filtered" to file names. */
  narrowed?: boolean;
  tables: ReportTable[];
  title: string;
};

/** Why a report could not be produced, with the HTTP status a download should answer with. */
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

/** How many rows each way of viewing a report can hold. */
export const reportRowLimits: Record<ReportPurpose, number> = {
  csv: 10_000,
  pdf: 2_000,
  preview: 500,
};

/** Cut a long list to what this purpose can hold. Downloads refuse instead of silently cutting. */
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

/** Spreadsheet rows for a report: its own, or every table stacked under a section column. */
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

/** Everything the file name needs to say whether it is a narrowed report. */
export function reportFilename(stem: string, date: string, filtered: boolean, extension: string) {
  return `${stem}${filtered ? "-filtered" : ""}-${date}.${extension}`;
}
