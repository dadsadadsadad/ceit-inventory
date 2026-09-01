import { BorrowStatus, ItemStatus, MaintenanceStatus, Prisma } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import { formatManilaDate, manilaCalendarDate, startOfManilaDay } from "@/lib/manila-date";
import { parseReportExportFilters, reportDateWhere } from "@/lib/report-export-filters";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pageSize: [number, number] = [595.28, 841.89];
const pageMargin = 44;
const pageBottom = 48;
const pageWidth = pageSize[0] - pageMargin * 2;
const maximumPcExportRecords = 10_000;
const textColor = rgb(0.12, 0.1, 0.08);
const mutedColor = rgb(0.36, 0.33, 0.3);
const accentColor = rgb(0.78, 0.24, 0.04);
const lineColor = rgb(0.84, 0.81, 0.76);

type ReportWriter = {
  addBody: (text: string, size?: number, color?: ReturnType<typeof rgb>) => void;
  addHeading: (text: string) => void;
  addMetricRow: (metrics: Array<{ label: string; value: string }>) => void;
  addTable: (headers: string[], rows: string[][]) => void;
  finish: () => void;
};

function reportDate(value: Date) {
  return formatManilaDate(value, { day: "numeric", month: "long", year: "numeric" });
}

function clampText(value: string, maximum = 96) {
  const normalized = value.normalize("NFKD").replaceAll(/[\u0300-\u036f]/g, "").replaceAll(/[^\x20-\x7E]/g, "?").replaceAll(/\s+/g, " ").trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 3)}...` : normalized;
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
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
    ensureSpace(lines.length * lineHeight + 4);
    for (const line of lines) {
      page.drawText(line, { x: pageMargin, y: cursor - size, size, font: regular, color });
      cursor -= lineHeight;
    }
    cursor -= 4;
  };

  const addHeading = (text: string) => {
    ensureSpace(32);
    cursor -= 10;
    page.drawText(text, { x: pageMargin, y: cursor - 15, size: 15, font: bold, color: accentColor });
    cursor -= 26;
  };

  const addMetricRow = (metrics: Array<{ label: string; value: string }>) => {
    const gap = 10;
    const width = (pageWidth - gap * (metrics.length - 1)) / metrics.length;
    const height = 58;
    ensureSpace(height + 12);
    metrics.forEach((metric, index) => {
      const x = pageMargin + index * (width + gap);
      page.drawRectangle({ x, y: cursor - height, width, height, borderColor: lineColor, borderWidth: 0.8, color: rgb(0.99, 0.98, 0.96) });
      page.drawText(clampText(metric.label, 34), { x: x + 10, y: cursor - 18, size: 8, font: bold, color: mutedColor });
      page.drawText(clampText(metric.value, 20), { x: x + 10, y: cursor - 42, size: 18, font: bold, color: textColor });
    });
    cursor -= height + 12;
  };

  const addTable = (headers: string[], rows: string[][]) => {
    if (!rows.length) {
      addBody("No data available.", 10, mutedColor);
      return;
    }
    const columns = headers.length;
    const columnWidth = pageWidth / columns;
    const headerHeight = 22;
    const drawHeader = () => {
      ensureSpace(headerHeight + 16);
      page.drawRectangle({ x: pageMargin, y: cursor - headerHeight, width: pageWidth, height: headerHeight, color: rgb(0.2, 0.18, 0.15) });
      headers.forEach((header, index) => {
        page.drawText(clampText(header, 22), { x: pageMargin + index * columnWidth + 6, y: cursor - 15, size: 8, font: bold, color: rgb(1, 1, 1) });
      });
      cursor -= headerHeight;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell) => wrapText(clampText(cell, 60), regular, 8.5, columnWidth - 12));
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * 13 + 12;
      if (cursor - rowHeight < pageBottom) {
        newPage();
        drawHeader();
      }
      if (rowIndex % 2 === 1) page.drawRectangle({ x: pageMargin, y: cursor - rowHeight, width: pageWidth, height: rowHeight, color: rgb(0.97, 0.95, 0.92) });
      cellLines.forEach((lines, columnIndex) => {
        lines.forEach((line, lineIndex) => {
          page.drawText(line, { x: pageMargin + columnIndex * columnWidth + 6, y: cursor - 12 - lineIndex * 13, size: 8.5, font: regular, color: textColor });
        });
      });
      cursor -= rowHeight;
    });
    cursor -= 12;
  };

  return {
    addBody,
    addHeading,
    addMetricRow,
    addTable,
    finish: () => footer(page),
  };
}

export async function GET(request: Request) {
  const user = await requireInventoryAccess();
  const canManage = canManageInventory(user.role);
  const parameters = new URL(request.url).searchParams;
  const kind = parameters.get("kind");

  if (kind === "pcs") {
    if (!canManage) return new Response("Forbidden", { status: 403 });
    let filters: ReturnType<typeof parseReportExportFilters>;
    try {
      filters = parseReportExportFilters(parameters);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Invalid export filters.", { status: 400 });
    }
    const dateWhere = reportDateWhere(filters.dateRange);
    const where: Prisma.InventoryItemWhereInput = {
      isComputer: true,
      ...(Object.keys(dateWhere).length ? { createdAt: dateWhere } : {}),
      ...(filters.inventoryStatus ? { status: filters.inventoryStatus } : {}),
    };
    const pcs = await prisma.inventoryItem.findMany({
      where,
      include: { category: true, location: true, computer: { include: { software: { orderBy: { name: "asc" } } } } },
      orderBy: [{ location: { name: "asc" } }, { name: "asc" }, { assetTag: "asc" }],
      take: maximumPcExportRecords + 1,
    });
    if (pcs.length > maximumPcExportRecords) {
      return new Response(`This export exceeds ${maximumPcExportRecords.toLocaleString()} records. Narrow the data before exporting.`, { status: 413 });
    }

    const document = await PDFDocument.create();
    document.setTitle("CEIT PC and Mac Register");
    document.setAuthor("CEIT Inventory");
    document.setSubject("Individually tracked PC and Mac register");
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const firstPage = document.addPage(pageSize);
    const writer = createReportWriter(document, regular, bold, firstPage, firstPage.getHeight() - 150);
    const calendarDate = manilaCalendarDate();

    firstPage.drawText("CEIT INVENTORY", { x: pageMargin, y: firstPage.getHeight() - 70, size: 11, font: bold, color: accentColor });
    firstPage.drawText("PC and Mac register", { x: pageMargin, y: firstPage.getHeight() - 104, size: 25, font: bold, color: textColor });
    firstPage.drawText(`Generated ${reportDate(new Date())}`, { x: pageMargin, y: firstPage.getHeight() - 124, size: 10, font: regular, color: mutedColor });
    writer.addBody("One row per individually tracked PC or Mac, including its asset tag, QR identifier, room, technical configuration, installed software, and latest inspection date.", 10, mutedColor);
    writer.addHeading("Register snapshot");
    writer.addMetricRow([
      { label: "PC / Mac records", value: pcs.length.toLocaleString() },
      { label: "Checked records", value: pcs.filter((item) => item.lastCheckedAt).length.toLocaleString() },
      { label: "Needs attention", value: pcs.filter((item) => item.status === ItemStatus.DEFECTIVE || item.status === ItemStatus.NOT_TESTED).length.toLocaleString() },
    ]);
    writer.addHeading("Tracked PC and Mac records");
    writer.addTable(
      ["Asset tag", "PC / Mac", "Room", "Last checked", "Configuration"],
      pcs.map((item) => {
        const computer = item.computer;
        const hardware = [
          computer?.processor,
          computer?.memoryGb === null || computer?.memoryGb === undefined ? null : `${computer.memoryGb} GB RAM`,
          computer?.storageGb === null || computer?.storageGb === undefined ? null : `${computer.storageGb} GB ${computer.storageType ?? "storage"}`,
          computer?.graphics,
          computer?.hardwareDescription,
        ].filter(Boolean).join(" · ");
        const software = [
          [computer?.operatingSystem, computer?.osVersion].filter(Boolean).join(" "),
          computer?.softwareDescription,
          computer?.software.map((entry) => [entry.name, entry.version].filter(Boolean).join(" ")).join(", "),
        ].filter(Boolean).join(" · ");
        return [
          item.assetTag ?? "Not assigned",
          `${item.name}\nQR: ${item.qrCode}\n${inventoryStatusLabel(item.status)}`,
          item.location.name,
          reportDate(item.lastCheckedAt ?? computer?.lastCheckedAt ?? item.createdAt),
          [hardware && `Hardware: ${hardware}`, software && `Software: ${software}`].filter(Boolean).join("\n"),
        ];
      }),
    );
    writer.finish();
    const bytes = await document.save();
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="ceit-pc-register-${calendarDate}.pdf"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const today = startOfManilaDay();
  const calendarDate = manilaCalendarDate();
  const [itemCount, statusCounts, categoryCounts, locationCounts, openTicketCount, activeBorrowCount, overdueBorrowCount] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.inventoryItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, _count: { select: { items: true } } } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { name: true, _count: { select: { items: true } } } }),
    canManage ? prisma.maintenanceTicket.count({ where: { status: { not: MaintenanceStatus.RESOLVED } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] } } }) : Promise.resolve(0),
    canManage ? prisma.borrowRequest.count({ where: { status: { in: [BorrowStatus.BORROWED, BorrowStatus.RETURN_REQUESTED] }, expectedReturnDate: { lt: today } } }) : Promise.resolve(0),
  ]);

  const document = await PDFDocument.create();
  document.setTitle("CEIT Inventory Overview");
  document.setAuthor("CEIT Inventory");
  document.setSubject("Current inventory overview");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const firstPage = document.addPage(pageSize);
  const writer = createReportWriter(document, regular, bold, firstPage, firstPage.getHeight() - 150);

  firstPage.drawText("CEIT INVENTORY", { x: pageMargin, y: firstPage.getHeight() - 70, size: 11, font: bold, color: accentColor });
  firstPage.drawText("Inventory overview", { x: pageMargin, y: firstPage.getHeight() - 104, size: 25, font: bold, color: textColor });
  firstPage.drawText(`Generated ${reportDate(new Date())}`, { x: pageMargin, y: firstPage.getHeight() - 124, size: 10, font: regular, color: mutedColor });
  writer.addBody("A current summary of CEIT equipment, stock locations, and operational workload.", 10, mutedColor);
  writer.addHeading("Operational snapshot");
  writer.addMetricRow([
    { label: "Inventory records", value: itemCount.toLocaleString() },
    { label: "Active locations", value: locationCounts.filter((location) => location._count.items > 0).length.toLocaleString() },
  ]);

  if (canManage) {
    writer.addMetricRow([
      { label: "Needs attention", value: openTicketCount.toLocaleString() },
      { label: "Currently borrowed", value: activeBorrowCount.toLocaleString() },
      { label: "Overdue borrowing", value: overdueBorrowCount.toLocaleString() },
    ]);
  }

  const statusMap = new Map(statusCounts.map((entry) => [entry.status, entry._count._all]));
  writer.addHeading("Status distribution");
  writer.addTable(["Status", "Records"], Object.values(ItemStatus).map((status) => [inventoryStatusLabel(status), (statusMap.get(status) ?? 0).toLocaleString()]));

  const populatedCategories = categoryCounts.filter((category) => category._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 10);
  writer.addHeading("Items by category");
  writer.addTable(["Category", "Records"], populatedCategories.map((category) => [category.name, category._count.items.toLocaleString()]));

  const populatedLocations = locationCounts.filter((location) => location._count.items > 0).sort((left, right) => right._count.items - left._count.items).slice(0, 10);
  writer.addHeading("Items by location");
  writer.addTable(["Location", "Records"], populatedLocations.map((location) => [location.name, location._count.items.toLocaleString()]));

  writer.finish();
  const bytes = await document.save();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const filename = `ceit-inventory-overview-${calendarDate}.pdf`;
  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
