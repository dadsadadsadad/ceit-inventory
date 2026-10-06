import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { appearanceBootstrap } from "@/lib/appearance-bootstrap";
import {
  accentPresets,
  accentProperties,
  contrastRatio,
  getAccentColors,
  hexToHsv,
  hsvToHex,
  minimumContrast,
  defaultPreferences,
  parsePreferences,
  preferenceAttributes,
  preferenceKeys,
  resolveTheme,
  toneChoices,
  type DisplayPreferences,
  type Theme,
} from "@/lib/appearance";

// Run the script that restores the saved look before the page paints, against a stand-in page.
function restoreAppearance(
  theme: string | null,
  accent: string | null,
  extra: Record<string, string> = {},
  deviceIsDark = false,
) {
  const properties = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const attributes = new Map<string, string>();
  const saved: Record<string, string | null> = {
    ...extra,
    "ceit-theme": theme,
    "ceit-accent": accent,
  };
  runInNewContext(appearanceBootstrap, {
    localStorage: { getItem: (key: string) => saved[key] ?? null },
    window: { matchMedia: () => ({ matches: deviceIsDark }) },
    document: {
      documentElement: {
        dataset,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
        style: {
          setProperty: (key: string, value: string) => properties.set(key, value),
          removeProperty: (key: string) => properties.delete(key),
        },
      },
    },
  });
  return { properties, dataset, attributes };
}

describe("saved appearance", () => {
  const colors = [...accentPresets.map(({ color }) => color), "#000000", "#ffffff", "#808080"];

  it.each<Theme>(["dark", "light"])(
    "restores the same colors before and after React in %s mode",
    (theme) => {
      for (const color of colors) {
        const { properties, dataset } = restoreAppearance(theme, color);
        const accent = getAccentColors(theme, color);
        expect(dataset).toEqual({ theme, accent: "custom" });
        expect(properties.get("--accent")).toBe(accent.accent);
        expect(properties.get("--accent-hover")).toBe(accent.accentHover);
        expect(properties.get("--accent-strong")).toBe(accent.accentStrong);
        expect(properties.get("--accent-strong-hover")).toBe(accent.accentStrongHover);
        expect(properties.get("--accent-text")).toBe(accent.accentText);
        expect(properties.get("--accent-on-strong")).toBe(accent.accentOnStrong);
        expect(properties.get("--sidebar")).toBe(accent.sidebar);
        expect(properties.get("--sidebar-deep")).toBe(accent.sidebarDeep);
        expect([...properties.keys()]).toEqual([...accentProperties]);
        expect(
          contrastRatio(accent.accent, theme === "light" ? "#e4e9ef" : "#343c47"),
        ).toBeGreaterThanOrEqual(minimumContrast);
        expect(contrastRatio(accent.accentStrong, accent.accentOnStrong)).toBeGreaterThanOrEqual(
          minimumContrast,
        );
      }
    },
  );

  it("uses defaults for invalid preferences and accepts old saved presets", () => {
    expect(restoreAppearance("unknown", "invalid").dataset).toEqual({
      theme: "light",
      accent: "orange",
    });
    expect(restoreAppearance(null, null).properties.size).toBe(0);
    expect(restoreAppearance("light", "violet").properties.get("--accent")).toBe(
      getAccentColors("light", "#8b5cf6").accent,
    );
  });

  it("keeps the selected color when moving between hex input and the picker", () => {
    for (const color of colors) {
      expect(hsvToHex(hexToHsv(color))).toBe(color);
    }
  });
});

describe("display preferences", () => {
  const saved = (values: Record<string, string>) => (key: string) => values[key] ?? null;

  it("starts from the standard look, and ignores anything it does not recognise", () => {
    expect(parsePreferences(saved({}))).toEqual(defaultPreferences);
    expect(
      parsePreferences(
        saved({
          "ceit-theme": "neon",
          "ceit-tone-light": "midnight",
          "ceit-text": "huge",
          "ceit-corners": "<script>",
        }),
      ),
    ).toEqual(defaultPreferences);
  });

  it("reads each saved choice", () => {
    const preferences = parsePreferences(
      saved({
        [preferenceKeys.mode]: "auto",
        [preferenceKeys.toneLight]: "cool",
        [preferenceKeys.toneDark]: "black",
        [preferenceKeys.text]: "larger",
        [preferenceKeys.corners]: "round",
        [preferenceKeys.titles]: "sans",
        [preferenceKeys.contrast]: "high",
        [preferenceKeys.motion]: "reduced",
      }),
    );
    expect(preferences).toEqual({
      mode: "auto",
      toneLight: "cool",
      toneDark: "black",
      text: "larger",
      corners: "round",
      titles: "sans",
      contrast: "high",
      motion: "reduced",
    });
  });

  it("makes auto follow the device and leaves light and dark alone", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("puts attributes on the page only for choices that are not the standard", () => {
    expect(preferenceAttributes(defaultPreferences, "light")).toEqual({
      "data-contrast": null,
      "data-corners": null,
      "data-mode": "light",
      "data-motion": null,
      "data-text": null,
      "data-titles": null,
      "data-tone": null,
    });
    const everything: DisplayPreferences = {
      contrast: "high",
      corners: "sharp",
      mode: "dark",
      motion: "reduced",
      text: "large",
      titles: "sans",
      toneDark: "midnight",
      toneLight: "bright",
    };
    expect(preferenceAttributes(everything, "dark")).toMatchObject({
      "data-contrast": "high",
      "data-corners": "sharp",
      "data-motion": "reduced",
      "data-text": "large",
      "data-titles": "sans",
      "data-tone": "midnight",
    });
    // Each mode has its own tone, so the light one is not used in dark mode and vice versa.
    expect(preferenceAttributes(everything, "light")["data-tone"]).toBe("bright");
  });

  it("restores every choice before the page paints, the same way the panel applies them", () => {
    const values = {
      "ceit-tone-dark": "black",
      "ceit-text": "large",
      "ceit-corners": "round",
      "ceit-titles": "sans",
      "ceit-contrast": "high",
      "ceit-motion": "reduced",
    };
    const { attributes, dataset } = restoreAppearance("dark", null, values);
    expect(dataset.theme).toBe("dark");
    expect(Object.fromEntries(attributes)).toEqual(
      Object.fromEntries(
        Object.entries(
          preferenceAttributes(
            parsePreferences((key) =>
              key === "ceit-theme" ? "dark" : (values as Record<string, string>)[key],
            ),
            "dark",
          ),
        ).filter(([, value]) => value),
      ),
    );
  });

  it("follows the device in auto mode, and defaults to light and the standard tone", () => {
    expect(restoreAppearance("auto", null, {}, true).dataset.theme).toBe("dark");
    expect(restoreAppearance("auto", null, {}, false).dataset.theme).toBe("light");
    const standard = restoreAppearance(null, null);
    expect(standard.dataset.theme).toBe("light");
    expect(standard.attributes.has("data-tone")).toBe(false);
    expect(standard.attributes.get("data-mode")).toBe("light");
    // A tone that belongs to the other mode is ignored rather than half applied.
    expect(
      restoreAppearance("light", null, { "ceit-tone-light": "midnight" }).attributes.has(
        "data-tone",
      ),
    ).toBe(false);
    expect(
      restoreAppearance("light", null, { "ceit-tone-light": "cool" }).attributes.get("data-tone"),
    ).toBe("cool");
  });

  it("offers the standard tone first in each mode", () => {
    expect(toneChoices.light[0]).toBe(defaultPreferences.toneLight);
    expect(toneChoices.dark[0]).toBe(defaultPreferences.toneDark);
  });
});
