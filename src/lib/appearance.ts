export type Theme = "dark" | "light";

export type Accent = string | null;

export type HsvColor = { hue: number; saturation: number; value: number };

export type RgbColor = { blue: number; green: number; red: number };

export type AppearanceTokens = {
  accent: string;
  accentHover: string;
  accentOnStrong: string;
  accentStrong: string;
  accentStrongHover: string;
  accentText: string;
  sidebar: string;
  sidebarDeep: string;
};

export const themeStorageKey = "ceit-theme";

export const accentStorageKey = "ceit-accent";

export const appearanceChangeEvent = "ceit-appearance-change";

export const contrastDark = "#000000";

export const contrastLight = "#ffffff";

export const minimumContrast = 4.7;

export const defaultAccents: Readonly<Record<Theme, string>> = {
  dark: "#ff9b50",
  light: "#963509",
};

export const accentPresets = [
  { name: "Cranberry", color: "#e5484d" },
  { name: "Orchid", color: "#a855f7" },
  { name: "Indigo", color: "#6366f1" },
  { name: "Ocean", color: "#0ea5e9" },
  { name: "Teal", color: "#14b8a6" },
  { name: "Emerald", color: "#22c55e" },
  { name: "Gold", color: "#eab308" },
] as const;

export const legacyAccentColors: Readonly<Record<string, string | null>> = {
  orange: null,
  violet: "#8b5cf6",
  blue: "#0ea5e9",
  emerald: "#10b981",
};

export const accentProperties = [
  "--accent",
  "--accent-hover",
  "--accent-soft",
  "--accent-strong",
  "--accent-strong-hover",
  "--accent-text",
  "--accent-on-strong",
  "--border-strong",
  "--sidebar",
  "--sidebar-deep",
] as const;

export function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

// Accept a complete six-digit hex color.
export function normalizeHex(value: string | null | undefined): string | null {
  const match = value?.trim().match(/^#([\da-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : null;
}

export function defaultAccentColor(theme: Theme) {
  return defaultAccents[theme];
}

export function hexToRgb(color: string): RgbColor {
  const normalized = normalizeHex(color) ?? contrastDark;
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ red, green, blue }: RgbColor) {
  const toHex = (channel: number) =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

// Blend two colors by the requested amount.
export function mixColors(start: string, end: string, endAmount: number) {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  const ratio = clamp(endAmount, 0, 1);
  return rgbToHex({
    red: from.red + (to.red - from.red) * ratio,
    green: from.green + (to.green - from.green) * ratio,
    blue: from.blue + (to.blue - from.blue) * ratio,
  });
}

export function relativeLuminance(color: string) {
  const { red, green, blue } = hexToRgb(color);
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

// Measure how clearly two colors differ in brightness.
export function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// Choose black or white text for this background.
export function readableTextColor(background: string) {
  return contrastRatio(background, contrastDark) >= contrastRatio(background, contrastLight)
    ? contrastDark
    : contrastLight;
}

// Adjust a color until text reaches the required contrast.
export function ensureContrast(
  color: string,
  background: string,
  direction: string,
  minimum = minimumContrast,
) {
  const normalized = normalizeHex(color) ?? defaultAccents.dark;
  if (contrastRatio(normalized, background) >= minimum) {
    return normalized;
  }

  let lowerBound = 0;
  let upperBound = 1;
  let accessibleColor = direction;

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const amount = (lowerBound + upperBound) / 2;
    const candidate = mixColors(normalized, direction, amount);
    if (contrastRatio(candidate, background) >= minimum) {
      accessibleColor = candidate;
      upperBound = amount;
    } else {
      lowerBound = amount;
    }
  }

  return accessibleColor;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

// Convert picker coordinates and hex colors.
export function hexToHsv(color: string): HsvColor {
  const normalized = normalizeHex(color) ?? defaultAccents.dark;
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;

  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (maximum === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  return {
    hue: (hue + 360) % 360,
    saturation: maximum === 0 ? 0 : (delta / maximum) * 100,
    value: maximum * 100,
  };
}

// Convert the picker sliders back into a hex color.
export function hsvToHex({ hue, saturation, value }: HsvColor) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = (value / 100) * (saturation / 100);
  const secondary = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const match = value / 100 - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (normalizedHue < 60) {
    [red, green] = [chroma, secondary];
  } else if (normalizedHue < 120) {
    [red, green] = [secondary, chroma];
  } else if (normalizedHue < 180) {
    [green, blue] = [chroma, secondary];
  } else if (normalizedHue < 240) {
    [green, blue] = [secondary, chroma];
  } else if (normalizedHue < 300) {
    [red, blue] = [secondary, chroma];
  } else {
    [red, blue] = [chroma, secondary];
  }

  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

// Keep custom colors readable in either theme.
export function getAccentColors(theme: Theme, color: string): AppearanceTokens {
  const textSurface = theme === "light" ? "#e4e9ef" : "#343c47";
  const linkDirection = theme === "light" ? contrastDark : contrastLight;
  const accent = ensureContrast(color, textSurface, linkDirection);
  const accentHover = mixColors(accent, linkDirection, 0.14);
  const accentStrong = ensureContrast(color, contrastLight, contrastDark);
  const sidebar = ensureContrast(color, contrastLight, contrastDark);

  return {
    accent,
    accentHover,
    accentOnStrong: contrastLight,
    accentStrong,
    accentStrongHover: mixColors(accentStrong, contrastDark, 0.16),
    accentText: readableTextColor(accent),
    sidebar,
    sidebarDeep: mixColors(sidebar, contrastDark, 0.38),
  };
}
