import { rgb } from "pdf-lib";

// Converts a hex colour from the website's stylesheet into the 0-1 channels pdf-lib expects.
function hex(value: string) {
  const channel = (start: number) => parseInt(value.slice(start, start + 2), 16) / 255;
  return rgb(channel(1), channel(3), channel(5));
}

/**
 * The colours and sizes of a PDF report. They are the website's paper-and-ink palette from
 * src/app/styles/tokens.css, so a printed report looks like it came from the same place.
 */
export const pdfTheme = {
  accent: hex("#b83f0b"),
  accentBright: hex("#ff9b50"),
  band: hex("#1b1814"),
  bandText: hex("#f3ede0"),
  bandMuted: hex("#b9b09e"),
  hairline: hex("#ddd6c6"),
  ink: hex("#1e1a14"),
  muted: hex("#665e50"),
  paper: hex("#f6f1e5"),
  rowTint: hex("#faf7ef"),
  white: hex("#ffffff"),
} as const;

/** A4 in points. */
export const pageLayout = {
  bottom: 56,
  height: 841.89,
  margin: 44,
  width: 595.28,
} as const;

export const contentWidth = pageLayout.width - pageLayout.margin * 2;
