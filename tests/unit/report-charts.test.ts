import { ItemStatus } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  countChart,
  hasChartData,
  monthChart,
  recentMonths,
  statusChart,
} from "@/lib/reports/charts";
import type { ReportModel } from "@/lib/reports/model";
import { renderReportPdf } from "@/lib/reports/pdf/render";

describe("report charts", () => {
  it("lists statuses in their usual order, in their colours, leaving out empty ones", () => {
    const chart = statusChart(
      new Map([
        [ItemStatus.DEFECTIVE, 2],
        [ItemStatus.OK, 10],
        [ItemStatus.LOST, 0],
      ]),
    );
    expect(chart.data).toEqual([
      { label: "OK", value: 10, tone: "ok" },
      { label: "Defective", value: 2, tone: "defective" },
    ]);
  });

  it("puts the largest first and keeps every entry", () => {
    const entries: [string, number][] = Array.from({ length: 10 }, (_, index) => [
      `Room ${index + 1}`,
      index + 1,
    ]);
    const chart = countChart("By room", entries, "records");
    expect(chart.data).toHaveLength(10);
    expect(chart.data[0]).toEqual({ label: "Room 10", value: 10 });
    expect(chart.data.at(-1)).toEqual({ label: "Room 1", value: 1 });
    expect(chart.data.some((entry) => entry.label === "Other")).toBe(false);
    expect(hasChartData(countChart("Empty", [["A", 0]], "records"))).toBe(false);
  });

  it("splits time into Philippine calendar months", () => {
    // still sept 30 in utc
    const months = recentMonths(new Date("2026-09-30T16:30:00.000Z"), 3);
    expect(months.map((month) => month.label)).toEqual(["Aug", "Sep", "Oct"]);
    expect(months[2].start.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(months[2].end.toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });

  it("draws bar and column charts into the PDF", async () => {
    const report: ReportModel = {
      kind: "overview",
      title: "Overview",
      description: "Charts",
      filters: [],
      generatedAt: new Date("2026-10-06T04:00:00Z"),
      metrics: [],
      tables: [],
      charts: [
        statusChart(new Map([[ItemStatus.OK, 4]])),
        countChart(
          "A very long category name that will not fit the label column",
          [["x", 3]],
          "records",
        ),
        monthChart(
          "Per month",
          [
            ["Jan", 1],
            ["Feb", 0],
            ["Mar", 5],
          ],
          "requests",
        ),
      ],
    };
    const document = await PDFDocument.load(await renderReportPdf(report));
    expect(document.getPageCount()).toBe(1);
  });
});
