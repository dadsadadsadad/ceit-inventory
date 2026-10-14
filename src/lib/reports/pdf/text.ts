import type { PDFFont } from "pdf-lib";

// standard pdf fonts only support latin-1
export function pdfText(value: unknown, max = 900) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replaceAll(/[\u2010-\u2015]/g, "-")
    .replaceAll(/[\u2018\u2019]/g, "'")
    .replaceAll(/[\u201C\u201D]/g, '"')
    .replaceAll("\u2026", "...")
    .replaceAll("₱", "PHP ")
    .replaceAll("·", "|")
    .replaceAll(/[^\x20-\x7E\xA0-\xFF\n]/g, "?")
    .replaceAll(/[\t\r]+/g, " ")
    .replaceAll(/ +/g, " ")
    .trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`
    : normalized;
}

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

export function wrapLine(text: string, font: PDFFont, size: number, width: number) {
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
      lines.push(line);
      line = word;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

export function capLines<T>(lines: T[], max: number, ellipsis: T) {
  return lines.length <= max ? lines : [...lines.slice(0, max - 1), ellipsis];
}
