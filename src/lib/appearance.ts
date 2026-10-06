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
  light: "#b83f0b",
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

/* ------------------------------------------------------------------ display preferences */
/*
  Besides the accent color, each device can choose how the workspace looks and feels. Every choice
  is saved on the device and applied as an attribute on <html> (see preferences.css), so it takes
  effect before the page paints (see appearance-bootstrap.ts, which must stay in step with this).
*/

export const modeChoices = ["light", "dark", "auto"] as const;
export type ModeChoice = (typeof modeChoices)[number];

/** The background tones on offer in each mode. The first is the standard look. */
export const toneChoices = {
  light: ["paper", "bright", "cool"],
  dark: ["ink", "midnight", "black"],
} as const;
export type Tone = (typeof toneChoices)[Theme][number];

export const toneLabels: Record<Tone, { label: string; swatch: readonly [string, string] }> = {
  paper: { label: "Paper", swatch: ["#f2ede1", "#fbf8f1"] },
  bright: { label: "Bright", swatch: ["#f7f6f3", "#ffffff"] },
  cool: { label: "Cool", swatch: ["#eceff2", "#f8fafb"] },
  ink: { label: "Ink", swatch: ["#131110", "#1c1916"] },
  midnight: { label: "Midnight", swatch: ["#0d1117", "#151b24"] },
  black: { label: "Black", swatch: ["#000000", "#0c0c0c"] },
};

export const textSizes = ["default", "large", "larger"] as const;
export type TextSize = (typeof textSizes)[number];

export const cornerStyles = ["sharp", "default", "round"] as const;
export type CornerStyle = (typeof cornerStyles)[number];

export const titleFonts = ["serif", "sans"] as const;
export type TitleFont = (typeof titleFonts)[number];

export const contrastLevels = ["standard", "high"] as const;
export type ContrastLevel = (typeof contrastLevels)[number];

export const motionLevels = ["full", "reduced"] as const;
export type MotionLevel = (typeof motionLevels)[number];

export type DisplayPreferences = {
  contrast: ContrastLevel;
  corners: CornerStyle;
  mode: ModeChoice;
  motion: MotionLevel;
  text: TextSize;
  titles: TitleFont;
  toneDark: Tone;
  toneLight: Tone;
};

export const defaultPreferences: DisplayPreferences = {
  contrast: "standard",
  corners: "default",
  mode: "light",
  motion: "full",
  text: "default",
  titles: "serif",
  toneDark: "ink",
  toneLight: "paper",
};

/** Where each choice is saved on the device. The mode keeps the original key. */
export const preferenceKeys = {
  contrast: "ceit-contrast",
  corners: "ceit-corners",
  mode: themeStorageKey,
  motion: "ceit-motion",
  text: "ceit-text",
  titles: "ceit-titles",
  toneDark: "ceit-tone-dark",
  toneLight: "ceit-tone-light",
} as const satisfies Record<keyof DisplayPreferences, string>;

/** A saved value if it is one of the allowed choices, otherwise the standard one. */
export function choiceOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Read the choices from saved strings, ignoring anything that is not recognised. */
export function parsePreferences(
  read: (key: string) => string | null | undefined,
): DisplayPreferences {
  return {
    contrast: choiceOf(read(preferenceKeys.contrast), contrastLevels, defaultPreferences.contrast),
    corners: choiceOf(read(preferenceKeys.corners), cornerStyles, defaultPreferences.corners),
    mode: choiceOf(read(preferenceKeys.mode), modeChoices, defaultPreferences.mode),
    motion: choiceOf(read(preferenceKeys.motion), motionLevels, defaultPreferences.motion),
    text: choiceOf(read(preferenceKeys.text), textSizes, defaultPreferences.text),
    titles: choiceOf(read(preferenceKeys.titles), titleFonts, defaultPreferences.titles),
    toneDark: choiceOf(
      read(preferenceKeys.toneDark),
      toneChoices.dark,
      defaultPreferences.toneDark,
    ),
    toneLight: choiceOf(
      read(preferenceKeys.toneLight),
      toneChoices.light,
      defaultPreferences.toneLight,
    ),
  };
}

/** The theme actually shown: "auto" follows the device's own light or dark setting. */
export function resolveTheme(mode: ModeChoice, deviceIsDark: boolean): Theme {
  return mode === "auto" ? (deviceIsDark ? "dark" : "light") : mode;
}

/** The attributes put on <html>. A standard choice has none, so the stylesheet stays untouched. */
export function preferenceAttributes(preferences: DisplayPreferences, theme: Theme) {
  const tone = theme === "dark" ? preferences.toneDark : preferences.toneLight;
  return {
    "data-contrast": preferences.contrast === "standard" ? null : preferences.contrast,
    "data-corners": preferences.corners === "default" ? null : preferences.corners,
    "data-mode": preferences.mode,
    "data-motion": preferences.motion === "full" ? null : preferences.motion,
    "data-text": preferences.text === "default" ? null : preferences.text,
    "data-titles": preferences.titles === "serif" ? null : preferences.titles,
    "data-tone": tone === toneChoices[theme][0] ? null : tone,
  } as const;
}
