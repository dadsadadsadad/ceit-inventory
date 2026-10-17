import { PDFDocument, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";

import { ceitLogoSvg } from "@/lib/ceit-logo";

import { formatReportDateTime } from "../format";
import { chartValue, hasChartData } from "../charts";
import type { ReportChart, ReportColumn, ReportMetric, ReportModel, ReportTable } from "../model";
import { capLines, pdfText, wrapLine } from "./text";
import { contentWidth, pageLayout, pdfChartTones, pdfTheme } from "./theme";

type Fonts = { bold: PDFFont; regular: PDFFont; serif: PDFFont };
type CellLine = { kind: "plain" | "primary" | "secondary"; text: string };

const { bottom, margin } = pageLayout;
const maxCellLines = 14;
const cellPadding = 6;

class Sheet {
  private cursor = 0;
  private page: PDFPage;

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: Fonts,
    private readonly report: ReportModel,
    private readonly logo: PDFImage,
  ) {
    this.page = document.addPage([pageLayout.width, pageLayout.height]);
    this.cover();
  }

  // header band
  private cover() {
    const { page, fonts, report } = this;
    const bandHeight = 150;
    const top = pageLayout.height;
    page.drawRectangle({
      x: 0,
      y: top - bandHeight,
      width: pageLayout.width,
      height: bandHeight,
      color: pdfTheme.band,
    });
    page.drawRectangle({
      x: 0,
      y: top - bandHeight - 3,
      width: pageLayout.width,
      height: 3,
      color: pdfTheme.accentBright,
    });
    this.wordmark(top - 52, pdfTheme.bandText, pdfTheme.accentBright);
    const logoHeight = 112;
    const logoWidth = (this.logo.width / this.logo.height) * logoHeight;
    page.drawImage(this.logo, {
      x: pageLayout.width - margin - logoWidth,
      y: top - 19 - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
    const stamp = formatReportDateTime(report.generatedAt);
    const stampWidth = fonts.regular.widthOfTextAtSize(pdfText(stamp), 8.5);
    page.drawText(pdfText(stamp), {
      x: pageLayout.width - margin - logoWidth - 18 - stampWidth,
      y: top - 52,
      size: 8.5,
      font: fonts.regular,
      color: pdfTheme.bandMuted,
    });
    page.drawText("INVENTORY REPORT", {
      x: margin,
      y: top - 86,
      size: 8,
      font: fonts.bold,
      color: pdfTheme.accentBright,
    });
    page.drawText(pdfText(report.title, 60), {
      x: margin,
      y: top - 116,
      size: 28,
      font: fonts.serif,
      color: pdfTheme.bandText,
    });
    page.drawText(pdfText(report.description, 92), {
      x: margin,
      y: top - 136,
      size: 9.5,
      font: fonts.regular,
      color: pdfTheme.bandMuted,
    });
    this.cursor = top - bandHeight - 30;
  }

  private wordmark(
    y: number,
    color: typeof pdfTheme.ink,
    dot: typeof pdfTheme.ink = pdfTheme.accent,
  ) {
    const { page, fonts } = this;
    page.drawText("CEIT", { x: margin, y, size: 15, font: fonts.serif, color });
    const width = fonts.serif.widthOfTextAtSize("CEIT", 15);
    page.drawText(".", { x: margin + width, y, size: 15, font: fonts.serif, color: dot });
  }

  private newPage() {
    const { fonts, report } = this;
    this.page = this.document.addPage([pageLayout.width, pageLayout.height]);
    const y = pageLayout.height - margin;
    this.wordmark(y - 6, pdfTheme.ink);
    const title = pdfText(report.title, 70);
    const width = fonts.regular.widthOfTextAtSize(title, 8.5);
    this.page.drawText(title, {
      x: pageLayout.width - margin - width,
      y: y - 5,
      size: 8.5,
      font: fonts.regular,
      color: pdfTheme.muted,
    });
    this.page.drawLine({
      start: { x: margin, y: y - 16 },
      end: { x: pageLayout.width - margin, y: y - 16 },
      thickness: 0.6,
      color: pdfTheme.hairline,
    });
    this.cursor = y - 40;
  }

  private ensure(height: number) {
    // row won't fit, new page and repeat the header
    if (this.cursor - height < bottom) {
      this.newPage();
    }
  }

  filters() {
    const { page, fonts, report } = this;
    const labelSize = 7.5;
    page.drawText("FILTERS", {
      x: margin,
      y: this.cursor - 9,
      size: labelSize,
      font: fonts.bold,
      color: pdfTheme.muted,
    });
    if (!report.filters.length) {
      page.drawText("None", {
        x: margin + 48,
        y: this.cursor - 9,
        size: 9,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
      this.cursor -= 30;
      return;
    }
    let x = margin + 48;
    let line = 0;
    const rowHeight = 20;
    for (const chip of report.filters) {
      const text = pdfText(chip, 70);
      const width = fonts.regular.widthOfTextAtSize(text, 8.5) + 16;
      if (x + width > pageLayout.width - margin) {
        x = margin + 48;
        line += 1;
      }
      const y = this.cursor - 15 - line * rowHeight;
      page.drawRectangle({
        x,
        y,
        width,
        height: 16,
        borderColor: pdfTheme.hairline,
        borderWidth: 0.8,
        color: pdfTheme.paper,
      });
      page.drawText(text, {
        x: x + 8,
        y: y + 5,
        size: 8.5,
        font: fonts.regular,
        color: pdfTheme.ink,
      });
      x += width + 6;
    }
    this.cursor -= 22 + (line + 1) * rowHeight;
  }

  // metric cards, 4 per row
  metrics(metrics: ReportMetric[]) {
    if (!metrics.length) {
      return;
    }
    const gap = 10;
    const perRow = metrics.length > 4 ? 4 : metrics.length;
    const height = 66;
    for (let start = 0; start < metrics.length; start += perRow) {
      const row = metrics.slice(start, start + perRow);
      const width = (contentWidth - gap * (perRow - 1)) / perRow;
      this.ensure(height + 12);
      row.forEach((metric, index) =>
        this.metric(metric, margin + index * (width + gap), width, height),
      );
      this.cursor -= height + 10;
    }
    this.cursor -= 8;
  }

  private metric(metric: ReportMetric, x: number, width: number, height: number) {
    const { page, fonts } = this;
    const top = this.cursor;
    const alert = metric.tone === "alert";
    page.drawRectangle({
      x,
      y: top - height,
      width,
      height,
      borderColor: pdfTheme.hairline,
      borderWidth: 0.8,
      color: pdfTheme.white,
    });
    page.drawRectangle({
      x,
      y: top - 2.5,
      width,
      height: 2.5,
      color: alert ? pdfTheme.accent : pdfTheme.ink,
    });
    page.drawText(pdfText(metric.label.toUpperCase(), 30), {
      x: x + 10,
      y: top - 20,
      size: 6.8,
      font: fonts.bold,
      color: pdfTheme.muted,
    });
    const value = pdfText(metric.value, 22);
    const size = Math.max(
      10,
      Math.min(21, (21 * (width - 20)) / Math.max(1, fonts.serif.widthOfTextAtSize(value, 21))),
    );
    page.drawText(value, {
      x: x + 10,
      y: top - 44,
      size,
      font: fonts.serif,
      color: alert ? pdfTheme.accent : pdfTheme.ink,
    });
    if (metric.note) {
      page.drawText(pdfText(metric.note, 38), {
        x: x + 10,
        y: top - 58,
        size: 7,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
    }
  }

  // charts, 2 per row
  charts(charts: ReportChart[]) {
    const drawable = charts.filter(hasChartData);
    if (!drawable.length) {
      return;
    }
    const gap = 12;
    const width = (contentWidth - gap) / 2;
    for (let start = 0; start < drawable.length; start += 2) {
      const pair = drawable.slice(start, start + 2);
      const height = Math.max(...pair.map((chart) => this.chartHeight(chart)));
      this.ensure(height + 14);
      pair.forEach((chart, index) =>
        this.chart(chart, margin + index * (width + gap), width, height),
      );
      this.cursor -= height + 12;
    }
    this.cursor -= 6;
  }

  private chartHeight(chart: ReportChart) {
    const header = chart.note ? 40 : 30;
    return chart.kind === "bars" ? header + chart.data.length * 16 + 12 : header + 128;
  }

  private chart(chart: ReportChart, x: number, width: number, height: number) {
    const { page, fonts } = this;
    const top = this.cursor;
    page.drawRectangle({
      x,
      y: top - height,
      width,
      height,
      borderColor: pdfTheme.hairline,
      borderWidth: 0.8,
      color: pdfTheme.white,
    });
    page.drawText(pdfText(chart.title, 48), {
      x: x + 10,
      y: top - 18,
      size: 11,
      font: fonts.serif,
      color: pdfTheme.ink,
    });
    if (chart.note) {
      page.drawText(pdfText(chart.note, 64), {
        x: x + 10,
        y: top - 30,
        size: 7.2,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
    }
    const bodyTop = top - (chart.note ? 40 : 30);
    const max = Math.max(1, ...chart.data.map((entry) => entry.value));
    const color = (entry: ReportChart["data"][number]) =>
      entry.tone ? pdfChartTones[entry.tone] : pdfChartTones.accent;

    if (chart.kind === "bars") {
      const labelWidth = Math.min(width * 0.36, 110);
      const valueWidth = chart.format === "peso" ? 64 : 30;
      const trackX = x + 10 + labelWidth + 6;
      const trackWidth = width - 20 - labelWidth - 6 - valueWidth;
      chart.data.forEach((entry, index) => {
        const rowTop = bodyTop - index * 16;
        const label = this.fit(entry.label, labelWidth, 7.8);
        page.drawText(label, {
          x: x + 10,
          y: rowTop - 10,
          size: 7.8,
          font: fonts.regular,
          color: pdfTheme.muted,
        });
        page.drawRectangle({
          x: trackX,
          y: rowTop - 12,
          width: trackWidth,
          height: 8,
          color: pdfTheme.chartTrack,
        });
        const barWidth = entry.value ? Math.max(2, (entry.value / max) * trackWidth) : 0;
        if (barWidth) {
          page.drawRectangle({
            x: trackX,
            y: rowTop - 12,
            width: barWidth,
            height: 8,
            color: color(entry),
          });
        }
        const value = pdfText(chartValue(chart, entry.value));
        page.drawText(value, {
          x: x + width - 10 - fonts.bold.widthOfTextAtSize(value, 8),
          y: rowTop - 10,
          size: 8,
          font: fonts.bold,
          color: pdfTheme.ink,
        });
      });
      return;
    }

    const baseline = top - height + 22;
    const plotHeight = bodyTop - baseline - 16;
    const slot = (width - 20) / chart.data.length;
    const barWidth = Math.min(16, slot * 0.6);
    page.drawLine({
      start: { x: x + 10, y: baseline },
      end: { x: x + width - 10, y: baseline },
      thickness: 0.6,
      color: pdfTheme.hairline,
    });
    chart.data.forEach((entry, index) => {
      const centre = x + 10 + slot * index + slot / 2;
      const barHeight = entry.value ? Math.max(2, (entry.value / max) * plotHeight) : 0;
      if (barHeight) {
        page.drawRectangle({
          x: centre - barWidth / 2,
          y: baseline,
          width: barWidth,
          height: barHeight,
          color: color(entry),
        });
      }
      const value = pdfText(chartValue(chart, entry.value));
      page.drawText(value, {
        x: centre - fonts.bold.widthOfTextAtSize(value, 7.5) / 2,
        y: baseline + barHeight + 4,
        size: 7.5,
        font: fonts.bold,
        color: pdfTheme.ink,
      });
      const label = this.fit(entry.label, slot - 2, 7.2);
      page.drawText(label, {
        x: centre - fonts.regular.widthOfTextAtSize(label, 7.2) / 2,
        y: baseline - 12,
        size: 7.2,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
    });
  }

  private fit(text: string, width: number, size: number) {
    const measure = (value: string) => this.fonts.regular.widthOfTextAtSize(value, size);
    let value = pdfText(text, 80);
    if (measure(value) <= width) {
      return value;
    }
    while (value.length > 1 && measure(`${value}...`) > width) {
      value = value.slice(0, -1).trimEnd();
    }
    return `${value}...`;
  }

  table(table: ReportTable) {
    const { fonts } = this;
    this.ensure(110);
    this.cursor -= 8;
    this.page.drawRectangle({
      x: margin,
      y: this.cursor - 13,
      width: 5,
      height: 13,
      color: pdfTheme.accent,
    });
    this.page.drawText(pdfText(table.heading, 70), {
      x: margin + 13,
      y: this.cursor - 11,
      size: 13,
      font: fonts.serif,
      color: pdfTheme.ink,
    });
    const count = `${table.total.toLocaleString()} ${table.total === 1 ? "row" : "rows"}`;
    this.page.drawText(count, {
      x: pageLayout.width - margin - fonts.regular.widthOfTextAtSize(count, 8),
      y: this.cursor - 10,
      size: 8,
      font: fonts.regular,
      color: pdfTheme.muted,
    });
    this.cursor -= 24;
    if (table.note) {
      this.cursor -= 1;
      this.page.drawText(pdfText(table.note, 130), {
        x: margin,
        y: this.cursor - 8,
        size: 8.5,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
      this.cursor -= 16;
    }
    if (!table.rows.length) {
      this.page.drawText(pdfText(table.emptyText, 120), {
        x: margin,
        y: this.cursor - 10,
        size: 9.5,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
      this.cursor -= 30;
      return;
    }
    this.rows(table);
  }

  private widths(columns: ReportColumn[]) {
    const total = columns.reduce((sum, column) => sum + column.width, 0);
    return columns.map((column) => (contentWidth * column.width) / total);
  }

  private cellLines(text: string, column: ReportColumn, width: number, size: number) {
    const { fonts } = this;
    const lines: CellLine[] = [];
    pdfText(text, 700)
      .split("\n")
      .forEach((line, index) => {
        const primary = column.primary && index === 0;
        const font = primary ? fonts.bold : fonts.regular;
        const lineSize = primary || !column.primary ? size : size - 0.6;
        for (const wrapped of wrapLine(line, font, lineSize, width)) {
          lines.push({
            text: wrapped,
            kind: primary ? "primary" : column.primary ? "secondary" : "plain",
          });
        }
      });
    return capLines(lines, maxCellLines, { text: "...", kind: "secondary" as const });
  }

  private rows(table: ReportTable) {
    const { fonts } = this;
    const size = 8.4;
    const lineHeight = size * 1.42;
    const widths = this.widths(table.columns);
    // left edge of each column
    const xs = widths.reduce<number[]>((all, width) => [...all, all.at(-1)! + width], [margin]);

    const header = () => {
      this.ensure(34);
      const headerHeight = 20;
      table.columns.forEach((column, index) => {
        const label = pdfText(column.label.toUpperCase(), 30);
        const labelWidth = fonts.bold.widthOfTextAtSize(label, 6.8);
        this.page.drawText(label, {
          x:
            column.align === "right"
              ? xs[index] + widths[index] - cellPadding - labelWidth
              : xs[index] + cellPadding,
          y: this.cursor - 13,
          size: 6.8,
          font: fonts.bold,
          color: pdfTheme.muted,
        });
      });
      this.page.drawLine({
        start: { x: margin, y: this.cursor - headerHeight },
        end: { x: margin + contentWidth, y: this.cursor - headerHeight },
        thickness: 1.1,
        color: pdfTheme.ink,
      });
      this.cursor -= headerHeight;
    };
    header();

    table.rows.forEach((row, rowIndex) => {
      const cells = table.columns.map((column, index) =>
        this.cellLines(row[index] ?? "", column, widths[index] - cellPadding * 2, size),
      );
      const height = Math.max(...cells.map((lines) => lines.length), 1) * lineHeight + 12;
      if (this.cursor - height < bottom) {
        this.newPage();
        header();
      }
      if (rowIndex % 2 === 1) {
        this.page.drawRectangle({
          x: margin,
          y: this.cursor - height,
          width: contentWidth,
          height,
          color: pdfTheme.rowTint,
        });
      }
      const tone = table.tones?.[rowIndex];
      if (tone) {
        this.page.drawRectangle({
          x: margin,
          y: this.cursor - height,
          width: contentWidth,
          height,
          color: pdfChartTones[tone],
          opacity: 0.09,
        });
        this.page.drawRectangle({
          x: margin,
          y: this.cursor - height,
          width: 2.5,
          height,
          color: pdfChartTones[tone],
        });
      }
      cells.forEach((lines, columnIndex) => {
        const column = table.columns[columnIndex];
        lines.forEach((line, lineIndex) => {
          const font = line.kind === "primary" ? fonts.bold : fonts.regular;
          const lineSize = line.kind === "secondary" ? size - 0.6 : size;
          const textWidth = font.widthOfTextAtSize(line.text, lineSize);
          this.page.drawText(line.text, {
            x:
              column.align === "right"
                ? xs[columnIndex] + widths[columnIndex] - cellPadding - textWidth
                : xs[columnIndex] + cellPadding,
            y: this.cursor - 6 - size - lineIndex * lineHeight + 1,
            size: lineSize,
            font,
            color: line.kind === "secondary" ? pdfTheme.muted : pdfTheme.ink,
          });
        });
      });
      this.page.drawLine({
        start: { x: margin, y: this.cursor - height },
        end: { x: margin + contentWidth, y: this.cursor - height },
        thickness: 0.5,
        color: pdfTheme.hairline,
      });
      this.cursor -= height;
    });
    this.cursor -= 14;
  }

  // page numbers go in at the end once the total is known
  finish() {
    const { fonts, report } = this;
    const pages = this.document.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: margin, y: 38 },
        end: { x: pageLayout.width - margin, y: 38 },
        thickness: 0.6,
        color: pdfTheme.hairline,
      });
      page.drawText(pdfText(`CEIT Inventory  |  ${report.title}`, 80), {
        x: margin,
        y: 24,
        size: 7.8,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
      const label = `Page ${index + 1} of ${pages.length}`;
      page.drawText(label, {
        x: pageLayout.width - margin - fonts.regular.widthOfTextAtSize(label, 7.8),
        y: 24,
        size: 7.8,
        font: fonts.regular,
        color: pdfTheme.muted,
      });
    });
  }
}

export async function renderReportPdf(report: ReportModel) {
  const document = await PDFDocument.create();
  document.setTitle(`CEIT ${report.title}`);
  document.setAuthor("CEIT Inventory");
  document.setSubject(report.description);
  document.setCreationDate(report.generatedAt);
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    serif: await document.embedFont(StandardFonts.TimesRomanBold),
  };
  const logo = await document.embedPng(
    await sharp(Buffer.from(ceitLogoSvg), { density: 300 })
      .resize({ height: 480 })
      .png()
      .toBuffer(),
  );
  const sheet = new Sheet(document, fonts, report, logo);
  sheet.filters();
  sheet.metrics(report.metrics);
  sheet.charts(report.charts ?? []);
  report.tables.forEach((table) => sheet.table(table));
  sheet.finish();
  return document.save();
}
