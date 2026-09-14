import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatReportDate } from "./format";

// A4 page layout.
const pageSize: [number, number] = [595.28, 841.89];

const pageMargin = 44;

const pageBottom = 48;

const pageWidth = pageSize[0] - pageMargin * 2;

const textColor = rgb(0.12, 0.1, 0.08);

export const mutedColor = rgb(0.36, 0.33, 0.3);

const accentColor = rgb(0.78, 0.24, 0.04);

const lineColor = rgb(0.84, 0.81, 0.76);

const surfaceColor = rgb(0.99, 0.98, 0.96);

const alternatingRowColor = rgb(0.97, 0.95, 0.92);

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

// Keep text compatible with the PDF font.
function pdfText(value: unknown, maximum = 900) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replaceAll(/[\u2010-\u2015]/g, "-")
    .replaceAll(/[\u2018\u2019]/g, "'")
    .replaceAll(/[\u201c\u201d]/g, '"')
    .replaceAll("\u2026", "...")
    .replaceAll("\u20b1", "PHP ")
    .replaceAll("\u00b7", " | ")
    .replaceAll(/[^\x20-\x7E\xA0-\xFF\n]/g, "?")
    .replaceAll(/[\t\r]+/g, " ")
    .replaceAll(/ +/g, " ")
    .trim();
  return normalized.length > maximum
    ? `${normalized.slice(0, Math.max(0, maximum - 3)).trimEnd()}...`
    : normalized;
}

function clampText(value: unknown, maximum = 96) {
  return pdfText(value, maximum);
}

// Break long identifiers to fit the PDF column.
function splitLongWord(word: string, font: PDFFont, size: number, width: number) {
  const pieces: string[] = [];
  let remaining = word;
  while (remaining && font.widthOfTextAtSize(remaining, size) > width) {
    let end = Math.min(remaining.length, Math.max(1, Math.floor(width / Math.max(size * 0.48, 1))));
    while (end > 1 && font.widthOfTextAtSize(remaining.slice(0, end), size) > width) {
      end -= 1;
    }
    pieces.push(remaining.slice(0, Math.max(1, end)));
    remaining = remaining.slice(Math.max(1, end));
  }
  if (remaining) {
    pieces.push(remaining);
  }
  return pieces;
}

// Wrap words to the available PDF width.
function wrapParagraph(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }
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
      if (line) {
        lines.push(line);
      }
      line = word;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

// Wrap PDF text while keeping its paragraph breaks.
function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = pdfText(text, 4_000).split(/\n+/);
  return paragraphs.flatMap((paragraph, index) =>
    index === 0
      ? wrapParagraph(paragraph, font, size, width)
      : ["", ...wrapParagraph(paragraph, font, size, width)],
  );
}

function cappedLines(lines: string[], maximum: number) {
  if (lines.length <= maximum) {
    return lines;
  }
  return [...lines.slice(0, Math.max(0, maximum - 1)), "..."];
}

// Scale table column widths to the printable page.
function columnWidths(widths: number[] | undefined, count: number) {
  if (!widths || widths.length !== count || widths.some((width) => width <= 0)) {
    return Array.from({ length: count }, () => pageWidth / count);
  }
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (pageWidth * width) / total);
}

// Draw content and handle page breaks.
function createReportWriter(
  document: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  initialPage: PDFPage,
  firstCursor: number,
): ReportWriter {
  let page = initialPage;
  let cursor = firstCursor;

  // Add the report name and page number.
  const footer = (target: PDFPage) => {
    target.drawLine({
      start: { x: pageMargin, y: 34 },
      end: { x: target.getWidth() - pageMargin, y: 34 },
      thickness: 0.6,
      color: lineColor,
    });
    target.drawText("CEIT Inventory", {
      x: pageMargin,
      y: 20,
      size: 8,
      font: regular,
      color: mutedColor,
    });
    target.drawText(`Page ${document.getPageCount()}`, {
      x: target.getWidth() - pageMargin - 28,
      y: 20,
      size: 8,
      font: regular,
      color: mutedColor,
    });
  };

  // Finish the current page and start the next one.
  const newPage = () => {
    footer(page);
    page = document.addPage(pageSize);
    cursor = page.getHeight() - pageMargin;
  };

  // Start a new page when the next block will not fit.
  const ensureSpace = (height: number) => {
    if (cursor - height < pageBottom) {
      newPage();
    }
  };

  // Draw wrapped report text.
  const addBody = (text: string, size = 10, color = textColor) => {
    const lineHeight = size * 1.45;
    const lines = wrapText(text, regular, size, pageWidth);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      ensureSpace(lineHeight + 4);
      page.drawText(lines[lineIndex], {
        x: pageMargin,
        y: cursor - size,
        size,
        font: regular,
        color,
      });
      cursor -= lineHeight;
    }
    cursor -= 4;
  };

  // Add a section heading with space for its content.
  const addHeading = (text: string) => {
    ensureSpace(82);
    cursor -= 10;
    page.drawText(clampText(text, 84), {
      x: pageMargin,
      y: cursor - 15,
      size: 15,
      font: bold,
      color: accentColor,
    });
    cursor -= 26;
  };

  // Add a smaller heading for a record.
  const addSubheading = (text: string) => {
    // Keep a record title with at least its first detail block so a device name
    // is never stranded at the bottom of the preceding page.
    ensureSpace(100);
    cursor -= 5;
    page.drawText(clampText(text, 96), {
      x: pageMargin,
      y: cursor - 12,
      size: 11,
      font: bold,
      color: textColor,
    });
    cursor -= 20;
  };

  // Draw summary cards across the page.
  const addMetricRow = (metrics: Array<{ label: string; value: string }>) => {
    const gap = 10;
    const width = (pageWidth - gap * (metrics.length - 1)) / metrics.length;
    const height = 58;
    ensureSpace(height + 12);
    metrics.forEach((metric, index) => {
      const x = pageMargin + index * (width + gap);
      page.drawRectangle({
        x,
        y: cursor - height,
        width,
        height,
        borderColor: lineColor,
        borderWidth: 0.8,
        color: surfaceColor,
      });
      page.drawText(clampText(metric.label, 34), {
        x: x + 10,
        y: cursor - 18,
        size: 8,
        font: bold,
        color: mutedColor,
      });
      const value = clampText(metric.value, 24);
      const valueSize = Math.max(
        9,
        Math.min(18, (18 * (width - 20)) / Math.max(1, bold.widthOfTextAtSize(value, 18))),
      );
      page.drawText(value, {
        x: x + 10,
        y: cursor - 42,
        size: valueSize,
        font: bold,
        color: textColor,
      });
    });
    cursor -= height + 12;
  };

  // Draw table rows and repeat headings after page breaks.
  const addTable = (headers: string[], rows: string[][], options: TableOptions = {}) => {
    if (!rows.length) {
      addBody("No records match this report.", 10, mutedColor);
      return;
    }
    const fontSize = options.fontSize ?? 8.5;
    const lineHeight = fontSize * 1.5;
    const maxCellCharacters = options.maxCellCharacters ?? 120;
    const widths = columnWidths(options.widths, headers.length);
    const xPositions = widths.reduce<number[]>(
      (positions, width) => [...positions, positions.at(-1)! + width],
      [pageMargin],
    );
    const headerHeight = 22;
    const drawHeader = () => {
      ensureSpace(headerHeight + 16);
      page.drawRectangle({
        x: pageMargin,
        y: cursor - headerHeight,
        width: pageWidth,
        height: headerHeight,
        color: rgb(0.2, 0.18, 0.15),
      });
      headers.forEach((header, index) => {
        const heading = wrapText(clampText(header, 28), bold, 7.6, widths[index] - 10).slice(0, 2);
        heading.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: xPositions[index] + 5,
            y: cursor - 11 - lineIndex * 8,
            size: 7.6,
            font: bold,
            color: rgb(1, 1, 1),
          }),
        );
      });
      cursor -= headerHeight;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) =>
        cappedLines(
          wrapText(clampText(cell, maxCellCharacters), regular, fontSize, widths[index] - 10),
          18,
        ),
      );
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * lineHeight + 10;
      if (cursor - rowHeight < pageBottom) {
        newPage();
        drawHeader();
      }
      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: pageMargin,
          y: cursor - rowHeight,
          width: pageWidth,
          height: rowHeight,
          color: alternatingRowColor,
        });
      }
      cellLines.forEach((lines, columnIndex) => {
        lines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: xPositions[columnIndex] + 5,
            y: cursor - 10 - lineIndex * lineHeight,
            size: fontSize,
            font: regular,
            color: textColor,
          });
        });
      });
      cursor -= rowHeight;
    });
    cursor -= 12;
  };

  // Lay out record details in one or two columns.
  const addDetailGrid = (details: Detail[]) => {
    let index = 0;
    while (index < details.length) {
      const first = details[index];
      const second = !first.wide && !details[index + 1]?.wide ? details[index + 1] : undefined;
      const entries = second ? [first, second] : [first];
      const width = second ? (pageWidth - 8) / 2 : pageWidth;
      const cells = entries.map((entry) => {
        const labelLines = cappedLines(
          wrapText(clampText(entry.label, 60), bold, 7.5, width - 18),
          3,
        );
        const valueLines = cappedLines(
          wrapText(pdfText(entry.value || "Not recorded", 900), regular, 9, width - 18),
          22,
        );
        return { entry, labelLines, valueLines };
      });
      const contentHeight = Math.max(
        ...cells.map((cell) => cell.labelLines.length * 9 + cell.valueLines.length * 13),
        28,
      );
      const height = contentHeight + 18;
      if (cursor - height < pageBottom) {
        newPage();
      }
      cells.forEach((cell, cellIndex) => {
        const x = pageMargin + cellIndex * (width + 8);
        page.drawRectangle({
          x,
          y: cursor - height,
          width,
          height,
          borderColor: lineColor,
          borderWidth: 0.6,
          color: surfaceColor,
        });
        cell.labelLines.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: x + 9,
            y: cursor - 13 - lineIndex * 9,
            size: 7.5,
            font: bold,
            color: mutedColor,
          }),
        );
        const valueY = cursor - 13 - cell.labelLines.length * 9 - 4;
        cell.valueLines.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: x + 9,
            y: valueY - 9 - lineIndex * 13,
            size: 9,
            font: regular,
            color: textColor,
          }),
        );
      });
      cursor -= height + 8;
      index += second ? 2 : 1;
    }
  };

  return {
    addBody,
    addDetailGrid,
    addHeading,
    addMetricRow,
    addSubheading,
    addTable,
    finish: () => footer(page),
  };
}

// Send the PDF as a private download.
export function documentResponse(document: PDFDocument, filename: string) {
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

// Set up the PDF fonts, title, and first page.
export async function reportDocument(title: string, subtitle: string) {
  const document = await PDFDocument.create();
  document.setTitle(`CEIT ${title}`);
  document.setAuthor("CEIT Inventory");
  document.setSubject(subtitle);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const firstPage = document.addPage(pageSize);
  firstPage.drawText("CEIT INVENTORY", {
    x: pageMargin,
    y: firstPage.getHeight() - 70,
    size: 11,
    font: bold,
    color: accentColor,
  });
  firstPage.drawText(title, {
    x: pageMargin,
    y: firstPage.getHeight() - 104,
    size: 25,
    font: bold,
    color: textColor,
  });
  firstPage.drawText(`Generated ${formatReportDate(new Date())}`, {
    x: pageMargin,
    y: firstPage.getHeight() - 124,
    size: 10,
    font: regular,
    color: mutedColor,
  });
  return {
    document,
    writer: createReportWriter(document, regular, bold, firstPage, firstPage.getHeight() - 150),
  };
}
