"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";

type Theme = "dark" | "light";
type Accent = string | null;

const themeStorageKey = "ceit-theme";
const accentStorageKey = "ceit-accent";
const appearanceChangeEvent = "ceit-appearance-change";
const defaultPickerColor = "#f97316";

const legacyAccentColors: Readonly<Record<string, string | null>> = {
  orange: null,
  violet: "#8b5cf6",
  blue: "#0ea5e9",
  emerald: "#10b981",
};

const customAccentProperties = [
  "--accent",
  "--accent-hover",
  "--accent-soft",
  "--accent-strong",
  "--accent-text",
  "--border-strong",
  "--sidebar",
  "--sidebar-deep",
] as const;

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

function sanitizeHexColor(value: string | null | undefined): string | null {
  const match = value?.trim().match(/^#([\da-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function resolveAccent(value: string | null): Accent {
  const customColor = sanitizeHexColor(value);
  if (customColor) {
    return customColor;
  }

  return value ? legacyAccentColors[value.toLowerCase()] ?? null : null;
}

function getThemeSnapshot(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return isTheme(storedTheme) ? storedTheme : "dark";
  } catch {
    const documentTheme = document.documentElement.dataset.theme;
    return documentTheme === "dark" || documentTheme === "light" ? documentTheme : "dark";
  }
}

function getAccentSnapshot(): Accent {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return resolveAccent(window.localStorage.getItem(accentStorageKey));
  } catch {
    return resolveAccent(document.documentElement.style.getPropertyValue("--accent"));
  }
}

function subscribeToAppearanceChanges(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(appearanceChangeEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(appearanceChangeEvent, callback);
  };
}

function colorMix(color: string, percentage: number, mixWith: string) {
  return `color-mix(in srgb, ${color} ${percentage}%, ${mixWith})`;
}

function accentTextColor(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness >= 145 ? "#201006" : "#fffaf3";
}

function clearCustomAccentProperties(root: HTMLElement) {
  customAccentProperties.forEach((property) => root.style.removeProperty(property));
}

function applyAppearance(theme: Theme, accent: Accent) {
  const root = document.documentElement;
  const customColor = sanitizeHexColor(accent);

  root.dataset.theme = theme;

  if (!customColor) {
    root.dataset.accent = "orange";
    clearCustomAccentProperties(root);
    return;
  }

  const isLight = theme === "light";
  root.dataset.accent = "custom";
  root.style.setProperty("--accent", customColor);
  root.style.setProperty("--accent-hover", colorMix(customColor, isLight ? 78 : 64, isLight ? "black" : "white"));
  root.style.setProperty("--accent-soft", colorMix(customColor, isLight ? 12 : 17, "transparent"));
  root.style.setProperty("--accent-strong", colorMix(customColor, isLight ? 79 : 74, "black"));
  root.style.setProperty("--accent-text", accentTextColor(customColor));
  root.style.setProperty("--border-strong", colorMix(customColor, isLight ? 43 : 53, "transparent"));
  root.style.setProperty("--sidebar", colorMix(customColor, isLight ? 83 : 76, isLight ? "#5b1a08" : "#2f0c04"));
  root.style.setProperty("--sidebar-deep", colorMix(customColor, isLight ? 58 : 56, isLight ? "#200704" : "#080405"));
}

function migrateAccentStorage(accent: Accent) {
  try {
    const storedAccent = window.localStorage.getItem(accentStorageKey);

    if (accent) {
      if (storedAccent !== accent) {
        window.localStorage.setItem(accentStorageKey, accent);
      }
    } else if (storedAccent !== null) {
      window.localStorage.removeItem(accentStorageKey);
    }
  } catch {
    // Storage is optional; the current page still receives the selected color.
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribeToAppearanceChanges, getThemeSnapshot, () => "dark");
  const accent = useSyncExternalStore<Accent>(subscribeToAppearanceChanges, getAccentSnapshot, () => null);
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const headingId = useId();
  const colorInputId = useId();

  useEffect(() => {
    // Read storage again so the first hydration effect never overrides the
    // synchronous bootstrap choice with the server fallback values.
    const currentTheme = getThemeSnapshot();
    const currentAccent = getAccentSnapshot();
    applyAppearance(currentTheme, currentAccent);
    migrateAccentStorage(currentAccent);
  }, [theme, accent]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !controlRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function saveAppearance(nextTheme: Theme, nextAccent: Accent) {
    applyAppearance(nextTheme, nextAccent);

    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);

      if (nextAccent) {
        window.localStorage.setItem(accentStorageKey, nextAccent);
      } else {
        window.localStorage.removeItem(accentStorageKey);
      }
    } catch {
      // Appearance choices should still work for the current session when
      // storage is unavailable (for example, in a restricted browser mode).
    }

    window.dispatchEvent(new Event(appearanceChangeEvent));
  }

  function selectTheme(nextTheme: Theme) {
    saveAppearance(nextTheme, accent);
  }

  function selectAccent(event: ChangeEvent<HTMLInputElement>) {
    const nextAccent = sanitizeHexColor(event.currentTarget.value);
    if (nextAccent) {
      saveAppearance(theme, nextAccent);
    }
  }

  function resetAccent() {
    saveAppearance(theme, null);
  }

  const pickerColor = accent ?? defaultPickerColor;
  const accentLabel = accent ? `${accent} custom accent` : "CEIT orange accent";

  return (
    <div
      ref={controlRef}
      className="appearance-control fixed right-4 z-50"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {isOpen ? (
        <section
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
          className="appearance-popover absolute bottom-14 right-0 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] shadow-[var(--shadow)]"
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Palette className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id={headingId} className="text-sm font-semibold tracking-tight">Appearance</h2>
              <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">Choose a mode and a personal accent for this device.</p>
            </div>
          </div>

          <fieldset className="border-0 p-0">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Mode</legend>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Color mode">
              <button
                type="button"
                onClick={() => selectTheme("light")}
                aria-pressed={theme === "light"}
                className={`appearance-mode-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  theme === "light"
                    ? "border-[var(--border-strong)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-transparent text-[var(--muted-strong)] hover:border-[var(--border-strong)]"
                }`}
              >
                <Sun className="h-4 w-4" aria-hidden="true" />
                Light
              </button>
              <button
                type="button"
                onClick={() => selectTheme("dark")}
                aria-pressed={theme === "dark"}
                className={`appearance-mode-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  theme === "dark"
                    ? "border-[var(--border-strong)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-transparent text-[var(--muted-strong)] hover:border-[var(--border-strong)]"
                }`}
              >
                <Moon className="h-4 w-4" aria-hidden="true" />
                Dark
              </button>
            </div>
          </fieldset>

          <fieldset className="mt-5 border-0 p-0">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Accent color</legend>
            <div className="appearance-color-picker flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
              <input
                id={colorInputId}
                type="color"
                value={pickerColor}
                onChange={selectAccent}
                aria-label="Choose a custom accent color"
                className="appearance-color-input h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-transparent p-1"
              />
              <label htmlFor={colorInputId} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-xs font-semibold text-[var(--foreground)]">Choose a custom color</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--muted)]">{accent ?? "CEIT orange"}</span>
              </label>
              <button
                type="button"
                onClick={resetAccent}
                aria-pressed={accent === null}
                className={`appearance-reset-color inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  accent === null
                    ? "border-[var(--border-strong)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-transparent text-[var(--muted-strong)] hover:border-[var(--border-strong)]"
                }`}
              >
                {accent === null ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                CEIT orange
              </button>
            </div>
          </fieldset>

          <p className="sr-only" aria-live="polite">{`${theme} mode with ${accentLabel} selected.`}</p>
        </section>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="appearance-trigger grid h-12 w-12 place-items-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] shadow-[var(--shadow)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label="Open appearance settings"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={isOpen}
        title="Appearance settings"
      >
        <Palette className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
