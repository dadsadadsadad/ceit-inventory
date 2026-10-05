import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  capRows,
  csvRows,
  reportFilename,
  ReportRequestError,
  reportRowLimits,
  type ReportModel,
} from "@/lib/reports/model";
import { renderReportPdf } from "@/lib/reports/pdf/render";
import { pdfText } from "@/lib/reports/pdf/text";

function sample(rowCount: number, overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    kind: "inventory",
    title: "Inventory",
    description: "Equipment and supplies.",
    filters: ["Status: Defective", "Room: Lab 1"],
    generatedAt: new Date("2026-10-01T04:00:00Z"),
    metrics: [
      { label: "Records", value: String(rowCount) },
      { label: "Needs attention", value: "3", tone: "alert" },
    ],
    tables: [
      {
        heading: "Records",
        columns: [
          { label: "Item", width: 2, primary: true },
          { label: "Qty", width: 1, align: "right" },
        ],
        rows: Array.from({ length: rowCount }, (_, index) => [
          `Projector ${index}\nINV-${index}\nRoom ${index % 4}`,
          String(index),
        ]),
        total: rowCount,
        emptyText: "Nothing here.",
      },
    ],
    ...overrides,
  };
}

describe("report rows", () => {
  const rows = Array.from({ length: reportRowLimits.preview + 5 }, (_, index) => index);

  it("keeps a short list as it is", () => {
    expect(capRows([1, 2, 3], "preview")).toEqual({ rows: [1, 2, 3], total: 3 });
  });

  it("trims a long preview and remembers how many rows exist", () => {
    const capped = capRows(rows, "preview");
    expect(capped.rows).toHaveLength(reportRowLimits.preview);
    expect(capped.total).toBe(rows.length);
  });

  it("refuses to cut a download short", () => {
    const tooMany = Array.from({ length: reportRowLimits.pdf + 1 }, (_, index) => index);
    expect(() => capRows(tooMany, "pdf", "PCs")).toThrow(ReportRequestError);
    try {
      capRows(tooMany, "pdf", "PCs");
    } catch (error) {
      expect((error as ReportRequestError).status).toBe(413);
      expect((error as Error).message).toContain("download the CSV instead");
    }
    expect(capRows(tooMany, "csv").rows).toHaveLength(tooMany.length);
  });
});

describe("report spreadsheets", () => {
  it("uses the report's own rows when it has them", () => {
    const csv = [["A"], ["1"]];
    expect(csvRows(sample(1, { csv }))).toBe(csv);
  });

  it("stacks every table under a section column otherwise", () => {
    const rows = csvRows(sample(2));
    expect(rows[0]).toEqual(["Section", "Record", "Details"]);
    expect(rows[1]).toEqual(["Records", "Projector 0 · INV-0 · Room 0", "0"]);
    expect(rows).toHaveLength(3);
  });

  it("marks narrowed reports in the file name", () => {
    expect(reportFilename("ceit-software", "2026-10-06", false, "csv")).toBe(
      "ceit-software-2026-10-06.csv",
    );
    expect(reportFilename("ceit-software", "2026-10-06", true, "pdf")).toBe(
      "ceit-software-filtered-2026-10-06.pdf",
    );
  });
});

describe("report PDF", () => {
  it("draws a titled document", async () => {
    const bytes = await renderReportPdf(sample(5));
    const document = await PDFDocument.load(bytes);
    expect(document.getTitle()).toBe("CEIT Inventory");
    expect(document.getAuthor()).toBe("CEIT Inventory");
    expect(document.getPageCount()).toBe(1);
  });

  it("continues a long table on more pages", async () => {
    const document = await PDFDocument.load(await renderReportPdf(sample(150)));
    expect(document.getPageCount()).toBeGreaterThan(2);
  });

  it("copes with empty tables, no filters, and text the built-in fonts lack", async () => {
    const report = sample(0, {
      filters: [],
      title: "Équipement ₱ “quoted” 日本語",
      metrics: [],
    });
    report.tables.push({
      heading: "Wide",
      columns: [{ label: "Value", width: 1, primary: true }],
      rows: [[`${"x".repeat(400)}\n${"y ".repeat(300)}`], ["\u0000 tab\tseparated"]],
      total: 2,
      emptyText: "Nothing here.",
    });
    const document = await PDFDocument.load(await renderReportPdf(report));
    expect(document.getPageCount()).toBeGreaterThan(0);
  });

  it("makes text safe for the built-in fonts", () => {
    expect(pdfText("a—b “q” ₱ 5 · x")).toBe('a-b "q" PHP 5 | x');
    expect(pdfText("日本")).toBe("??");
    expect(pdfText("x".repeat(20), 10)).toBe("xxxxxxx...");
  });
});
