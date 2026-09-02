import { BorrowStatus, ItemCondition, ItemStatus, MaintenancePriority, MaintenanceStatus, Prisma } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { auditEventData } from "@/lib/audit-event";
import { auditActionLabel, auditActorLabel, auditCategory, auditChangedFields, auditEventDetail, auditTrailWhere, parseAuditTrailFilters, type AuditTrailEvent } from "@/lib/audit-trail";
import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import type { InventoryUser } from "@/lib/inventory-auth";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { formatManilaDate, manilaCalendarDate, startOfManilaDay } from "@/lib/manila-date";
import { borrowingReportStateLabel, borrowingReportStatusFilter, parseReportExportFilters, reportDateWhere, type ReportExportFilters } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pageSize: [number, number] = [595.28, 841.89];
const pageMargin = 44;
const pageBottom = 48;
const pageWidth = pageSize[0] - pageMargin * 2;
// PDFs are intentionally more conservative than CSV exports. A very large
// table, or hundreds of full PC profiles, can otherwise exhaust a serverless
// response before the browser receives a usable file.
const maximumPdfRecords = 2_000;
const maximumPcProfileRecords = 500;
const textColor = rgb(0.12, 0.1, 0.08);
const mutedColor = rgb(0.36, 0.33, 0.3);
const accentColor = rgb(0.78, 0.24, 0.04);
const lineColor = rgb(0.84, 0.81, 0.76);
const surfaceColor = rgb(0.99, 0.98, 0.96);
const alternatingRowColor = rgb(0.97, 0.95, 0.92);

async function auditedPdfResponse(user: InventoryUser, kind: string, response: Response) {
  try {
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "EXPORTED",
        actor: user,
        entity: { id: `pdf:${kind}`, label: `${kind} PDF report`, type: "report-export" },
        metadata: { activityKind: "report-export", format: "PDF", kind },
        summary: `${kind} report exported as PDF.`,
      }),
    });
  } catch (error) {
    console.error("Unable to record PDF export audit event", error);
  }
  return response;
}

type PdfColor = ReturnType<typeof rgb>;
type Detail = { label: string; value: string; wide?: boolean };
type TableOptions = { fontSize?: number; maxCellCharacters?: number; widths?: number[] };
type ReportWriter = {
  addBody: (text: string, size?: number, color?: PdfColor) => void;
  addDetailGrid: (details: Detail[]) => void;
  addHeading: (text: string) => void;
  addMetricRow: (metrics: Array<{ label: string; value: string }>) => void;
  addSubheading: (text: string) => void;
  addTable: (headers: string[], rows: string[][], options?: TableOptions) => void;
  finish: () => void;
};

function reportDate(value: Date) {
  return formatManilaDate(value, { day: "numeric", month: "long", year: "numeric" });
}

function reportDateTime(value: Date | null | undefined) {
  return value ? formatManilaDate(value, { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function pdfText(value: unknown, maximum = 900) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^\x20-\x7E\n]/g, "?")
    .replaceAll(/[\t\r]+/g, " ")
    .replaceAll(/ +/g, " ")
    .trim();
  return normalized.length > maximum ? `${normalized.slice(0, Math.max(0, maximum - 3)).trimEnd()}...` : normalized;
}

function clampText(value: unknown, maximum = 96) {
  return pdfText(value, maximum);
}

function splitLongWord(word: string, font: PDFFont, size: number, width: number) {
  const pieces: string[] = [];
  let remaining = word;
  while (remaining && font.widthOfTextAtSize(remaining, size) > width) {
    let end = Math.min(remaining.length, Math.max(1, Math.floor(width / Math.max(size * 0.48, 1))));
    while (end > 1 && font.widthOfTextAtSize(remaining.slice(0, end), size) > width) end -= 1;
    pieces.push(remaining.slice(0, Math.max(1, end)));
    remaining = remaining.slice(Math.max(1, end));
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function wrapParagraph(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      const pieces = splitLongWord(word, font, size, width);
      lines.push(...pieces.slice(0, -1));
      line = pieces.at(-1) ?? "";
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = pdfText(text, 4_000).split(/\n+/);
  return paragraphs.flatMap((paragraph, index) => index === 0 ? wrapParagraph(paragraph, font, size, width) : ["", ...wrapParagraph(paragraph, font, size, width)]);
}

function cappedLines(lines: string[], maximum: number) {
  if (lines.length <= maximum) return lines;
  return [...lines.slice(0, Math.max(0, maximum - 1)), "..."];
}

function normalisedWidths(widths: number[] | undefined, count: number) {
  if (!widths || widths.length !== count || widths.some((width) => width <= 0)) return Array.from({ length: count }, () => pageWidth / count);
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => pageWidth * width / total);
}

function createReportWriter(document: PDFDocument, regular: PDFFont, bold: PDFFont, initialPage: PDFPage, firstCursor: number): ReportWriter {
  let page = initialPage;
  let cursor = firstCursor;

  const footer = (target: PDFPage) => {
    target.drawLine({ start: { x: pageMargin, y: 34 }, end: { x: target.getWidth() - pageMargin, y: 34 }, thickness: 0.6, color: lineColor });
    target.drawText("CEIT Inventory", { x: pageMargin, y: 20, size: 8, font: regular, color: mutedColor });
    target.drawText(`Page ${document.getPageCount()}`, { x: target.getWidth() - pageMargin - 28, y: 20, size: 8, font: regular, color: mutedColor });
  };

  const newPage = () => {
    footer(page);
    page = document.addPage(pageSize);
    cursor = page.getHeight() - pageMargin;
  };

  const ensureSpace = (height: number) => {
    if (cursor - height < pageBottom) newPage();
  };

  const addBody = (text: string, size = 10, color = textColor) => {
    const lineHeight = size * 1.45;
    const lines = wrapText(text, regular, size, pageWidth);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      ensureSpace(lineHeight + 4);
      page.drawText(lines[lineIndex], { x: pageMargin, y: cursor - size, size, font: regular, color });
      cursor -= lineHeight;
    }
    cursor -= 4;
  };

  const addHeading = (text: string) => {
    ensureSpace(38);
    cursor -= 10;
    page.drawText(clampText(text, 84), { x: pageMargin, y: cursor - 15, size: 15, font: bold, color: accentColor });
    cursor -= 26;
  };

  const addSubheading = (text: string) => {
    // Keep a record title with at least its first detail block so a device name
    // is never stranded at the bottom of the preceding page.
    ensureSpace(100);
    cursor -= 5;
    page.drawText(clampText(text, 96), { x: pageMargin, y: cursor - 12, size: 11, font: bold, color: textColor });
    cursor -= 20;
  };

  const addMetricRow = (metrics: Array<{ label: string; value: string }>) => {
    const gap = 10;
    const width = (pageWidth - gap * (metrics.length - 1)) / metrics.length;
    const height = 58;
    ensureSpace(height + 12);
    metrics.forEach((metric, index) => {
      const x = pageMargin + index * (width + gap);
      page.drawRectangle({ x, y: cursor - height, width, height, borderColor: lineColor, borderWidth: 0.8, color: surfaceColor });
      page.drawText(clampText(metric.label, 34), { x: x + 10, y: cursor - 18, size: 8, font: bold, color: mutedColor });
      page.drawText(clampText(metric.value, 20), { x: x + 10, y: cursor - 42, size: 18, font: bold, color: textColor });
    });
    cursor -= height + 12;
  };

  const addTable = (headers: string[], rows: string[][], options: TableOptions = {}) => {
    if (!rows.length) {
      addBody("No records match this report.", 10, mutedColor);
      return;
    }
    const fontSize = options.fontSize ?? 8.5;
    const lineHeight = fontSize * 1.5;
    const maxCellCharacters = options.maxCellCharacters ?? 120;
    const widths = normalisedWidths(options.widths, headers.length);
    const xPositions = widths.reduce<number[]>((positions, width) => [...positions, positions.at(-1)! + width], [pageMargin]);
    const headerHeight = 22;
    const drawHeader = () => {
      ensureSpace(headerHeight + 16);
      page.drawRectangle({ x: pageMargin, y: cursor - headerHeight, width: pageWidth, height: headerHeight, color: rgb(0.2, 0.18, 0.15) });
      headers.forEach((header, index) => {
        const heading = wrapText(clampText(header, 28), bold, 7.6, widths[index] - 10).slice(0, 2);
        heading.forEach((line, lineIndex) => page.drawText(line, { x: xPositions[index] + 5, y: cursor - 11 - lineIndex * 8, size: 7.6, font: bold, color: rgb(1, 1, 1) }));
      });
      cursor -= headerHeight;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) => cappedLines(wrapText(clampText(cell, maxCellCharacters), regular, fontSize, widths[index] - 10), 18));
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * lineHeight + 10;
      if (cursor - rowHeight < pageBottom) {
        newPage();
        drawHeader();
      }
      if (rowIndex % 2 === 1) page.drawRectangle({ x: pageMargin, y: cursor - rowHeight, width: pageWidth, height: rowHeight, color: alternatingRowColor });
      cellLines.forEach((lines, columnIndex) => {
        lines.forEach((line, lineIndex) => {
          page.drawText(line, { x: xPositions[columnIndex] + 5, y: cursor - 10 - lineIndex * lineHeight, size: fontSize, font: regular, color: textColor });
        });
      });
      cursor -= rowHeight;
    });
    cursor -= 12;
  };

  const addDetailGrid = (details: Detail[]) => {
    let index = 0;
    while (index < details.length) {
      const first = details[index];
      const second = !first.wide && !details[index + 1]?.wide ? details[index + 1] : undefined;
      const entries = second ? [first, second] : [first];
      const width = second ? (pageWidth - 8) / 2 : pageWidth;
      const cells = entries.map((entry) => {
        const labelLines = cappedLines(wrapText(clampText(entry.label, 60), bold, 7.5, width - 18), 3);
        const valueLines = cappedLines(wrapText(pdfText(entry.value || "Not recorded", 900), regular, 9, width - 18), 22);
        return { entry, labelLines, valueLines };
      });
      const contentHeight = Math.max(...cells.map((cell) => cell.labelLines.length * 9 + cell.valueLines.length * 13), 28);
      const height = contentHeight + 18;
      if (cursor - height < pageBottom) newPage();
      cells.forEach((cell, cellIndex) => {
        const x = pageMargin + cellIndex * (width + 8);
        page.drawRectangle({ x, y: cursor - height, width, height, borderColor: lineColor, borderWidth: 0.6, color: surfaceColor });
        cell.labelLines.forEach((line, lineIndex) => page.drawText(line, { x: x + 9, y: cursor - 13 - lineIndex * 9, size: 7.5, font: bold, color: mutedColor }));
        const valueY = cursor - 13 - cell.labelLines.length * 9 - 4;
        cell.valueLines.forEach((line, lineIndex) => page.drawText(line, { x: x + 9, y: valueY - 9 - lineIndex * 13, size: 9, font: regular, color: textColor }));
      });
      cursor -= height + 8;
      index += second ? 2 : 1;
    }
  };

  return { addBody, addDetailGrid, addHeading, addMetricRow, addSubheading, addTable, finish: () => footer(page) };
}

function dateWhere(range: ReportExportFilters["dateRange"]) {
  const where = reportDateWhere(range);
  return Object.keys(where).length ? where : undefined;
}

function borrowingDateWhere(filters: ReportExportFilters, range: ReturnType<typeof dateWhere>): Prisma.BorrowRequestWhereInput {
  if (!range) return {};
  if (filters.borrowingState === "currently-borrowed") return { processedAt: range };
  if (filters.borrowingState === "returned") return { returnedAt: range };
  return { requestedAt: range };
}

function filterSummary(filters: ReportExportFilters, options: { audit?: boolean; borrowingState?: boolean; borrowingStatus?: boolean; inventoryStatus?: boolean; pcOnly?: boolean } = {}) {
  const segments: string[] = [];
  if (filters.dateRange.from || filters.dateRange.toExclusive) {
    const from = filters.dateRange.from ? reportDate(filters.dateRange.from) : "the beginning";
    const end = filters.dateRange.toExclusive ? new Date(filters.dateRange.toExclusive.getTime() - 1) : null;
    segments.push(`Date range: ${from}${end ? ` to ${reportDate(end)}` : " onward"}`);
  } else {
    segments.push("Date range: all time");
  }
  if (options.inventoryStatus && filters.inventoryStatus) segments.push(`Inventory status: ${inventoryStatusLabel(filters.inventoryStatus)}`);
  if (options.borrowingState && filters.borrowingState !== "all") segments.push(`Lending view: ${borrowingReportStateLabel(filters.borrowingState)}`);
  if (options.borrowingStatus && filters.borrowingStatus) segments.push(`Borrowing status: ${humanize(filters.borrowingStatus)}`);
  if (options.pcOnly && filters.pcOnly) segments.push("PC / Mac only");
  if (options.audit) segments.push("Audit event timestamp basis");
  return segments.join(" | ");
}

function hasReportFilters(filters: ReportExportFilters, options: { borrowing?: boolean; inventory?: boolean; pcOnly?: boolean } = {}) {
  return Boolean(
    filters.dateRange.from
    || filters.dateRange.toExclusive
    || (options.inventory && filters.inventoryStatus)
    || (options.borrowing && filters.borrowingState !== "all")
    || (options.borrowing && filters.borrowingStatus)
    || (options.pcOnly && filters.pcOnly),
  );
}

function documentResponse(document: PDFDocument, filename: string) {
  return document.save().then((bytes) => {
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

async function reportDocument(title: string, subtitle: string) {
  const document = await PDFDocument.create();
  document.setTitle(`CEIT ${title}`);
  document.setAuthor("CEIT Inventory");
  document.setSubject(subtitle);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const firstPage = document.addPage(pageSize);
  firstPage.drawText("CEIT INVENTORY", { x: pageMargin, y: firstPage.getHeight() - 70, size: 11, font: bold, color: accentColor });
  firstPage.drawText(title, { x: pageMargin, y: firstPage.getHeight() - 104, size: 25, font: bold, color: textColor });
  firstPage.drawText(`Generated ${reportDate(new Date())}`, { x: pageMargin, y: firstPage.getHeight() - 124, size: 10, font: regular, color: mutedColor });
  return { document, writer: createReportWriter(document, regular, bold, firstPage, firstPage.getHeight() - 150) };
}

type PcItem = Prisma.InventoryItemGetPayload<{ include: { category: true; location: true; computer: { include: { software: true } } } }>;

function pcHardware(item: PcItem) {
  const computer = item.computer;
  return [
    computer?.processor,
    computer?.graphics,
    computer?.memoryGb === null || computer?.memoryGb === undefined ? null : `${computer.memoryGb} GB RAM`,
    computer?.storageGb === null || computer?.storageGb === undefined ? null : `${computer.storageGb} GB ${computer.storageType ?? "storage"}`,
  ].filter(Boolean).join(" | ") || "No structured hardware details recorded";
}

function pcSoftware(item: PcItem) {
  const computer = item.computer;
  return [computer?.operatingSystem, computer?.osVersion].filter(Boolean).join(" ") || "No operating system recorded";
}

function pcInstalledSoftware(item: PcItem) {
  const entries = item.computer?.software ?? [];
  return entries.length ? entries.map((entry) => [entry.name, entry.version].filter(Boolean).join(" ")).join("; ") : "No installed software records";
}

function pcLastChecked(item: PcItem) {
  return item.lastCheckedAt ?? item.computer?.lastCheckedAt ?? null;
}

function auditPdfDetail(event: AuditTrailEvent) {
  const changes = auditChangedFields(event).map((change) => `${change.label}: ${change.value}`);
  return changes.join(" | ") || auditEventDetail(event) || "No additional event detail recorded.";
}

async function createPcRegisterPdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const where: Prisma.InventoryItemWhereInput = {
    isComputer: true,
    ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
    ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
  };
  const pcs = await prisma.inventoryItem.findMany({
    where,
    include: { category: true, location: true, computer: { include: { software: { orderBy: { name: "asc" } } } } },
    orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
    take: maximumPcProfileRecords + 1,
  });
  if (pcs.length > maximumPcProfileRecords) return new Response(`This profile-based PDF exceeds ${maximumPcProfileRecords.toLocaleString()} PC or Mac records. Narrow the data before exporting, or use the CSV export for the complete register.`, { status: 413 });

  const { document, writer } = await reportDocument("PC and Mac register", "Individually tracked PC and Mac technical register");
  writer.addBody("A readable technical profile for every matching tracked PC or Mac. Each device is shown in its own full-width record so its QR identifier, hardware details, and software records remain legible.", 10, mutedColor);
  writer.addBody(filterSummary(filters, { inventoryStatus: true }), 8.5, mutedColor);
  writer.addHeading("Register snapshot");
  writer.addMetricRow([
    { label: "PC / Mac records", value: pcs.length.toLocaleString() },
    { label: "Checked records", value: pcs.filter((item) => pcLastChecked(item)).length.toLocaleString() },
    { label: "Needs attention", value: pcs.filter((item) => item.status === ItemStatus.DEFECTIVE || item.status === ItemStatus.NOT_TESTED).length.toLocaleString() },
  ]);
  writer.addHeading("Tracked PC and Mac profiles");

  if (!pcs.length) writer.addBody("No PC or Mac records match the selected filters.", 10, mutedColor);
  pcs.forEach((item, index) => {
    const computer = item.computer;
    writer.addSubheading(`${index + 1}. ${item.name}`);
    writer.addDetailGrid([
      { label: "Asset tag", value: item.assetTag ?? "Not assigned" },
      { label: "Room / location", value: item.location.name },
      { label: "Status and condition", value: `${inventoryStatusLabel(item.status)} | ${humanize(item.condition)}` },
      { label: "Last checked", value: reportDateTime(pcLastChecked(item)) },
      { label: "QR identifier", value: item.qrCode, wide: true },
      { label: "Manufacturer / model", value: [item.manufacturer, item.model].filter(Boolean).join(" | ") || "Not recorded" },
      { label: "Serial number", value: item.serialNumber ?? "Not recorded" },
      { label: "Hardware configuration", value: pcHardware(item), wide: true },
      { label: "Hardware description", value: computer?.hardwareDescription ?? "Not recorded", wide: true },
      { label: "Operating system", value: pcSoftware(item) },
      { label: "Network identity", value: [computer?.macAddress && `MAC ${computer.macAddress}`, computer?.ipAddress && `IP ${computer.ipAddress}`].filter(Boolean).join(" | ") || "Not recorded" },
      { label: "Software description", value: computer?.softwareDescription ?? "Not recorded", wide: true },
      { label: "Installed software", value: pcInstalledSoftware(item), wide: true },
    ]);
  });
  writer.finish();
  return documentResponse(document, `ceit-pc-register${hasReportFilters(filters, { inventory: true }) ? "-filtered" : ""}-${calendarDate}.pdf`);
}

async function createInventoryPdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const where: Prisma.InventoryItemWhereInput = {
    ...(appliedDateFilter ? { createdAt: appliedDateFilter } : {}),
    ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
    ...(filters.pcOnly ? { isComputer: true } : {}),
  };
  const items = await prisma.inventoryItem.findMany({
    where,
    include: { category: true, location: true, computer: true },
    orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
    take: maximumPdfRecords + 1,
  });
  if (items.length > maximumPdfRecords) return new Response(`This export exceeds ${maximumPdfRecords.toLocaleString()} records. Narrow the data before exporting.`, { status: 413 });

  const { document, writer } = await reportDocument("Inventory register", "Filtered inventory register");
  writer.addBody("A detailed, filter-aware inventory register with traceable identifiers, placement, condition, and inspection information.", 10, mutedColor);
  writer.addBody(filterSummary(filters, { inventoryStatus: true, pcOnly: true }), 8.5, mutedColor);
  writer.addHeading("Filtered inventory snapshot");
  writer.addMetricRow([
    { label: "Records", value: items.length.toLocaleString() },
    { label: "Physical units", value: items.reduce((total, item) => total + item.quantity, 0).toLocaleString() },
    { label: "Tracked assets", value: items.filter((item) => item.itemType === "ASSET").length.toLocaleString() },
  ]);
  writer.addMetricRow([
    { label: "PC / Mac records", value: items.filter((item) => item.isComputer).length.toLocaleString() },
    { label: "Needs attention", value: items.filter((item) => item.status === ItemStatus.DEFECTIVE || item.status === ItemStatus.NOT_TESTED || item.condition === ItemCondition.FOR_REPAIR).length.toLocaleString() },
  ]);
  writer.addHeading("Inventory records");
  writer.addTable(
    ["Identifier", "Item and placement", "Type / quantity", "Status / condition", "Inspection"],
    items.map((item) => [
      [item.assetTag ?? "No asset tag", `QR: ${item.qrCode}`, item.serialNumber && `Serial: ${item.serialNumber}`].filter(Boolean).join("\n"),
      [item.name, `${item.category.name} | ${item.location.name}`, [item.manufacturer, item.model].filter(Boolean).join(" "), item.description].filter(Boolean).join("\n"),
      `${humanize(item.itemType)} | ${item.quantity} unit${item.quantity === 1 ? "" : "s"}${item.isComputer ? "\nPC / Mac" : ""}`,
      `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}`,
      `Last checked: ${reportDateTime(item.lastCheckedAt)}\nCreated: ${reportDate(item.createdAt)}`,
    ]),
    { fontSize: 8.1, maxCellCharacters: 135, widths: [1.18, 1.55, 0.9, 1, 1.27] },
  );
  writer.finish();
  return documentResponse(document, `ceit-inventory${hasReportFilters(filters, { inventory: true, pcOnly: true }) ? "-filtered" : ""}-${calendarDate}.pdf`);
}

async function createBorrowingsPdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const borrowingStatus = borrowingReportStatusFilter(filters);
  const requests = await prisma.borrowRequest.findMany({
    where: {
      ...borrowingDateWhere(filters, appliedDateFilter),
      ...(borrowingStatus ? { status: borrowingStatus } : {}),
    },
    include: { inventoryItem: { select: { assetTag: true, name: true } } },
    orderBy: { requestedAt: "desc" },
    take: maximumPdfRecords + 1,
  });
  if (requests.length > maximumPdfRecords) return new Response(`This export exceeds ${maximumPdfRecords.toLocaleString()} records. Narrow the data before exporting.`, { status: 413 });
  const today = startOfManilaDay();
  const active = requests.filter((request) => request.status === BorrowStatus.BORROWED || request.status === BorrowStatus.RETURN_REQUESTED);
  const returned = requests.filter((request) => request.status === BorrowStatus.RETURNED);
  const reportTitle = filters.borrowingState === "currently-borrowed" ? "Borrowed items" : filters.borrowingState === "returned" ? "Returned items" : "Borrowing history";
  const filenameStem = filters.borrowingState === "currently-borrowed" ? "ceit-borrowed-items" : filters.borrowingState === "returned" ? "ceit-returned-items" : "ceit-borrowing-history";

  const { document, writer } = await reportDocument(reportTitle, "Filtered equipment lending register");
  writer.addBody("A filtered history of borrowing requests, handoffs, return activity, and expected return dates. Currently borrowed includes return requests awaiting staff confirmation; date filters use checkout dates for borrowed items and completion dates for returned items.", 10, mutedColor);
  writer.addBody(filterSummary(filters, { borrowingState: true, borrowingStatus: true }), 8.5, mutedColor);
  writer.addHeading("Borrowing snapshot");
  writer.addMetricRow([
    { label: "Matching requests", value: requests.length.toLocaleString() },
    { label: filters.borrowingState === "returned" ? "Returned" : "Currently out", value: (filters.borrowingState === "returned" ? returned.length : active.length).toLocaleString() },
    { label: "Overdue", value: active.filter((request) => request.expectedReturnDate < today).length.toLocaleString() },
  ]);
  writer.addHeading("Borrowing records");
  writer.addTable(
    ["Item", "Borrower", "Request and return", "Status / quantity", "Purpose and notes"],
    requests.map((request) => [
      [request.inventoryItem.name, request.inventoryItem.assetTag ?? "No asset tag"].join("\n"),
      [request.borrowerName, request.studentNumber, request.contact].filter(Boolean).join("\n"),
      [`Requested: ${reportDateTime(request.requestedAt)}`, `Expected: ${reportDate(request.expectedReturnDate)}`, request.returnedAt ? `Returned: ${reportDateTime(request.returnedAt)}` : request.returnRequestedAt ? `Return requested: ${reportDateTime(request.returnRequestedAt)}` : "Not returned"].join("\n"),
      `${humanize(request.status)}\n${request.requestedQuantity} unit${request.requestedQuantity === 1 ? "" : "s"}`,
      [request.purpose, request.staffNotes && `Staff: ${request.staffNotes}`, request.returnRequestNotes && `Return: ${request.returnRequestNotes}`].filter(Boolean).join("\n"),
    ]),
    { fontSize: 8, maxCellCharacters: 150, widths: [1.1, 1.1, 1.34, 0.84, 1.35] },
  );
  writer.finish();
  return documentResponse(document, `${filenameStem}${hasReportFilters(filters, { borrowing: true }) ? "-filtered" : ""}-${calendarDate}.pdf`);
}

async function createMaintenancePdf(filters: ReportExportFilters, calendarDate: string) {
  const appliedDateFilter = dateWhere(filters.dateRange);
  const tickets = await prisma.maintenanceTicket.findMany({
    where: appliedDateFilter ? { openedAt: appliedDateFilter } : {},
    include: { inventoryItem: { select: { assetTag: true, name: true } } },
    orderBy: { openedAt: "desc" },
    take: maximumPdfRecords + 1,
  });
  if (tickets.length > maximumPdfRecords) return new Response(`This export exceeds ${maximumPdfRecords.toLocaleString()} records. Narrow the data before exporting.`, { status: 413 });
  const open = tickets.filter((ticket) => ticket.status === MaintenanceStatus.OPEN);

  const { document, writer } = await reportDocument("Service requests", "Filtered maintenance and service request register");
  writer.addBody("A filtered register of reported maintenance work, ownership, priority, resolution state, and supporting notes.", 10, mutedColor);
  writer.addBody(filterSummary(filters), 8.5, mutedColor);
  writer.addHeading("Service snapshot");
  writer.addMetricRow([
    { label: "Matching requests", value: tickets.length.toLocaleString() },
    { label: "Open requests", value: open.length.toLocaleString() },
    { label: "High / urgent", value: open.filter((ticket) => ticket.priority === MaintenancePriority.HIGH || ticket.priority === MaintenancePriority.URGENT).length.toLocaleString() },
  ]);
  writer.addHeading("Maintenance records");
  writer.addTable(
    ["Item and request", "Priority / status", "People", "Timeline", "Description / resolution"],
    tickets.map((ticket) => [
      [ticket.inventoryItem.name, ticket.inventoryItem.assetTag ?? "No asset tag", ticket.title].join("\n"),
      `${humanize(ticket.priority)}\n${ticket.status === MaintenanceStatus.OPEN ? "Needs attention" : "Resolved"}`,
      [`Reported by: ${ticket.reportedByName ?? "Not recorded"}`, `Assigned to: ${ticket.assignedToName ?? "Unassigned"}`].join("\n"),
      [`Opened: ${reportDateTime(ticket.openedAt)}`, ticket.resolvedAt ? `Resolved: ${reportDateTime(ticket.resolvedAt)}` : "Not resolved"].join("\n"),
      [ticket.description, ticket.resolutionNotes && `Resolution: ${ticket.resolutionNotes}`].filter(Boolean).join("\n"),
    ]),
    { fontSize: 8, maxCellCharacters: 190, widths: [1.18, 0.9, 1.03, 1.13, 1.49] },
  );
  writer.finish();
  return documentResponse(document, `ceit-service-requests${hasReportFilters(filters) ? "-filtered" : ""}-${calendarDate}.pdf`);
}

async function createAuditPdf(parameters: URLSearchParams, calendarDate: string) {
  let filters: ReturnType<typeof parseAuditTrailFilters>;
  try {
    filters = parseAuditTrailFilters(parameters);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid audit filters.", { status: 400 });
  }
  const activity = await prisma.inventoryAudit.findMany({
    where: auditTrailWhere(filters),
    include: { item: { select: { assetTag: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: maximumPdfRecords + 1,
  });
  if (activity.length > maximumPdfRecords) return new Response(`This export exceeds ${maximumPdfRecords.toLocaleString()} records. Narrow the data before exporting.`, { status: 413 });
  const actionCounts = new Map<string, number>();
  activity.forEach((event) => actionCounts.set(event.action, (actionCounts.get(event.action) ?? 0) + 1));
  const hasAuditFilters = Boolean(filters.dateRange.from || filters.dateRange.toExclusive || filters.action || filters.actor || filters.query);

  const { document, writer } = await reportDocument("Audit trail", "Filtered operational audit trail");
  writer.addBody("A detailed, time-stamped operational record of accounts, notes, settings, inventory changes, scans, borrowing, maintenance, imports, media, and exports.", 10, mutedColor);
  writer.addBody([
    filterSummary({ borrowingState: "all", borrowingStatus: undefined, dateRange: filters.dateRange, inventoryStatus: undefined, pcOnly: false, period: filters.period }, { audit: true }),
    filters.action ? `Action: ${auditActionLabel(filters.action)}` : null,
    filters.actor ? `User: ${filters.actor}` : null,
    filters.query ? `Search: ${filters.query}` : null,
  ].filter(Boolean).join(" | "), 8.5, mutedColor);
  writer.addHeading("Audit snapshot");
  writer.addMetricRow([
    { label: "Matching events", value: activity.length.toLocaleString() },
    { label: "Record updates", value: ((actionCounts.get("UPDATED") ?? 0) + (actionCounts.get("MOVED") ?? 0) + (actionCounts.get("STATUS_CHANGED") ?? 0)).toLocaleString() },
    { label: "QR scans", value: (actionCounts.get("SCANNED") ?? 0).toLocaleString() },
  ]);
  writer.addHeading("Recorded events");
  writer.addTable(
    ["Reference and time", "Event", "Subject", "Recorded by"],
    activity.map((event) => [
      [`AUD-${event.id.slice(0, 8).toUpperCase()}`, reportDateTime(event.createdAt)].join("\n"),
      [auditCategory(event as AuditTrailEvent), auditActionLabel(event.action), event.summary, auditPdfDetail(event as AuditTrailEvent)].join("\n"),
      [event.item?.name ?? event.entityLabel ?? "System operation", event.item?.assetTag ?? event.entityId ?? "No linked record"].join("\n"),
      auditActorLabel(event as AuditTrailEvent),
    ]),
    { fontSize: 8.1, maxCellCharacters: 180, widths: [1.08, 2.2, 1.32, 1.05] },
  );
  writer.finish();
  return documentResponse(document, `ceit-audit-trail${hasAuditFilters ? "-filtered" : ""}-${calendarDate}.pdf`);
}

async function createOverviewPdf(canManage: boolean, calendarDate: string) {
  const today = startOfManilaDay();
  const inspectionCutoff = new Date(today);
  inspectionCutoff.setDate(inspectionCutoff.getDate() - 90);
  const attentionWhere: Prisma.InventoryItemWhereInput = {
    OR: [
      { status: { in: [ItemStatus.DEFECTIVE, ItemStatus.NOT_TESTED] } },
      { condition: { in: [ItemCondition.POOR, ItemCondition.FOR_REPAIR] } },
    ],
  };
  const [inventorySummary, statusCounts, conditionCounts, categoryCounts, locationCounts, attentionCount, attentionItems, pcCount, stalePcCount, openTicketCount, urgentTicketCount, activeBorrowCount, overdueBorrowCount, openTickets, overdueBorrows] = await Promise.all([
    prisma.inventoryItem.aggregate({ _count: { _all: true, purchasePrice: true }, _sum: { quantity: true, purchasePrice: true } }),
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.inventoryItem.groupBy({ by: ["condition"], _count: { _all: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, _count: { select: { items: true } } } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { name: true, _count: { select: { items: true } } } }),
    prisma.inventoryItem.count({ where: attentionWhere }),
    prisma.inventoryItem.findMany({ where: attentionWhere, include: { category: true, location: true }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 25 }),
    prisma.inventoryItem.count({ where: { isComputer: true } }),
    prisma.inventoryItem.count({ where: { isComputer: true, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: inspectionCutoff } }] } }),
    canManage ? prisma.maintenanceTicket.count({ where: { status: MaintenanceStatus.OPEN } }) : Promise.resolve(0),
    canManage ? prisma.maintenanceTicket.count({ where: { status: MaintenanceStatus.OPEN, priority: { in: [MaintenancePriority.HIGH, MaintenancePriority.URGENT] } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] }, expectedReturnDate: { lt: today } } }) : Promise.resolve(0),
    canManage ? prisma.maintenanceTicket.findMany({ where: { status: MaintenanceStatus.OPEN }, include: { inventoryItem: { select: { assetTag: true, name: true } } }, orderBy: [{ priority: "desc" }, { openedAt: "asc" }], take: 20 }) : Promise.resolve([]),
    canManage ? prisma.borrowRequest.findMany({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] }, expectedReturnDate: { lt: today } }, include: { inventoryItem: { select: { assetTag: true, name: true } } }, orderBy: { expectedReturnDate: "asc" }, take: 20 }) : Promise.resolve([]),
  ]);
  const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  const conditionMap = new Map(conditionCounts.map((entry) => [entry.condition, entry._count._all]));
  const currency = new Intl.NumberFormat("en-PH", { currency: "PHP", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" });
  const topCategories = categoryCounts.filter((category) => category._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 12);
  const topLocations = locationCounts.filter((location) => location._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 12);

  const { document, writer } = await reportDocument("Inventory overview", "Operational inventory overview");
  writer.addBody("An operational overview of inventory coverage, condition, inspection readiness, and active workload. Counts reflect the live CEIT inventory at the time this report was generated.", 10, mutedColor);
  writer.addHeading("Inventory position");
  writer.addMetricRow([
    { label: "Inventory records", value: inventorySummary._count._all.toLocaleString() },
    { label: "Physical units", value: (inventorySummary._sum.quantity ?? 0).toLocaleString() },
    { label: "PC / Mac records", value: pcCount.toLocaleString() },
  ]);
  writer.addMetricRow(canManage ? [
    { label: "Needs attention", value: attentionCount.toLocaleString() },
    { label: "PCs due for check", value: stalePcCount.toLocaleString() },
    { label: "Recorded value", value: currency.format(Number(inventorySummary._sum.purchasePrice?.toString() ?? 0)) },
  ] : [
    { label: "Needs attention", value: attentionCount.toLocaleString() },
    { label: "PCs due for check", value: stalePcCount.toLocaleString() },
    { label: "Active locations", value: locationCounts.filter((location) => location._count.items > 0).length.toLocaleString() },
  ]);
  if (canManage) {
    writer.addHeading("Operational workload");
    writer.addMetricRow([
      { label: "Open service requests", value: openTicketCount.toLocaleString() },
      { label: "High / urgent", value: urgentTicketCount.toLocaleString() },
      { label: "Currently borrowed", value: activeBorrowCount.toLocaleString() },
      { label: "Overdue borrowing", value: overdueBorrowCount.toLocaleString() },
    ]);
  }
  writer.addHeading("Status distribution");
  writer.addTable(["Status", "Records", "Operational reading"], Object.values(ItemStatus).map((status) => [inventoryStatusLabel(status), (statusMap.get(status) ?? 0).toLocaleString(), status === ItemStatus.DEFECTIVE ? "Requires maintenance or replacement review" : status === ItemStatus.NOT_TESTED ? "Inspection still required" : status === ItemStatus.LOST ? "Investigate location and accountability" : status === ItemStatus.RETIRED ? "Removed from active service" : "Available or in service"]), { widths: [1, 0.8, 2.4] });
  writer.addHeading("Condition distribution");
  writer.addTable(["Condition", "Records", "Operational reading"], Object.values(ItemCondition).map((condition) => [humanize(condition), (conditionMap.get(condition) ?? 0).toLocaleString(), condition === ItemCondition.FOR_REPAIR ? "Repair work is required" : condition === ItemCondition.POOR ? "Review for repair or retirement" : "Serviceable condition"]), { widths: [1, 0.8, 2.4] });
  writer.addHeading(attentionCount > attentionItems.length ? `Items requiring attention (first ${attentionItems.length})` : "Items requiring attention");
  writer.addTable(["Item", "Category / location", "Status / condition", "Last checked"], attentionItems.map((item) => [[item.name, item.assetTag ?? "No asset tag"].join("\n"), `${item.category.name}\n${item.location.name}`, `${inventoryStatusLabel(item.status)}\n${humanize(item.condition)}`, reportDateTime(item.lastCheckedAt)]), { maxCellCharacters: 150, widths: [1.4, 1.3, 1.05, 1.15] });
  writer.addHeading("Coverage by category");
  writer.addTable(["Category", "Records"], topCategories.map((category) => [category.name, category._count.items.toLocaleString()]), { widths: [3, 1] });
  writer.addHeading("Coverage by location");
  writer.addTable(["Location", "Records"], topLocations.map((location) => [location.name, location._count.items.toLocaleString()]), { widths: [3, 1] });
  if (canManage) {
    writer.addHeading("Open service requests");
    writer.addTable(["Item", "Priority", "Assigned to", "Opened"], openTickets.map((ticket) => [[ticket.inventoryItem.name, ticket.inventoryItem.assetTag ?? "No asset tag", ticket.title].join("\n"), humanize(ticket.priority), ticket.assignedToName ?? "Unassigned", reportDateTime(ticket.openedAt)]), { widths: [1.8, 0.8, 1, 1.15] });
    writer.addHeading("Overdue borrowing");
    writer.addTable(["Item", "Borrower", "Expected return", "Status"], overdueBorrows.map((request) => [[request.inventoryItem.name, request.inventoryItem.assetTag ?? "No asset tag"].join("\n"), request.borrowerName, reportDate(request.expectedReturnDate), humanize(request.status)]), { widths: [1.6, 1.25, 1.1, 0.8] });
  }
  writer.finish();
  return documentResponse(document, `ceit-inventory-overview-${calendarDate}.pdf`);
}

export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  const parameters = new URL(request.url).searchParams;
  const kind = parameters.get("kind");
  const calendarDate = manilaCalendarDate();
  const canManage = canManageInventory(user.role);

  if (!kind || kind === "overview") return auditedPdfResponse(user, "overview", await createOverviewPdf(canManage, calendarDate));

  if (kind === "activity") {
    if (!canManageAdministration(user.role)) return new Response("Forbidden", { status: 403 });
    return auditedPdfResponse(user, "activity", await createAuditPdf(parameters, calendarDate));
  }

  let filters: ReportExportFilters;
  try {
    filters = parseReportExportFilters(parameters);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid export filters.", { status: 400 });
  }

  if (kind === "inventory") return auditedPdfResponse(user, "inventory", await createInventoryPdf(filters, calendarDate));
  if (!canManage) return new Response("Forbidden", { status: 403 });
  if (kind === "pcs") return auditedPdfResponse(user, "pcs", await createPcRegisterPdf(filters, calendarDate));
  if (kind === "borrowings") return auditedPdfResponse(user, "borrowings", await createBorrowingsPdf(filters, calendarDate));
  if (kind === "maintenance") return auditedPdfResponse(user, "maintenance", await createMaintenancePdf(filters, calendarDate));
  return new Response("Unknown export", { status: 400 });
}
