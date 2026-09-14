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
  type Theme,
} from "@/lib/appearance";

function restoreAppearance(theme: string | null, accent: string | null) {
  const properties = new Map<string, string>();
  const dataset: Record<string, string> = {};
  runInNewContext(appearanceBootstrap, {
    localStorage: { getItem: (key: string) => (key === "ceit-theme" ? theme : accent) },
    document: {
      documentElement: {
        dataset,
        style: {
          setProperty: (key: string, value: string) => properties.set(key, value),
          removeProperty: (key: string) => properties.delete(key),
        },
      },
    },
  });
  return { properties, dataset };
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
      theme: "dark",
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
