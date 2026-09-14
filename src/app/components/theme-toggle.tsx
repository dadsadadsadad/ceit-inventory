"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  type Theme,
  type Accent,
  themeStorageKey,
  accentStorageKey,
  appearanceChangeEvent,
  accentPresets,
  legacyAccentColors,
  accentProperties,
  isTheme,
  normalizeHex,
  defaultAccentColor,
  readableTextColor,
  clamp,
  hexToHsv,
  hsvToHex,
  getAccentColors,
} from "@/lib/appearance";

// Color picker controls.
type AccentColorPickerProps = {
  color: string;
  onChange: (color: string) => void;
  selectedAccent: Accent;
};

// Choose a color with sliders, presets, or a hex value.
function AccentColorPicker({ color, onChange, selectedAccent }: AccentColorPickerProps) {
  const hsv = hexToHsv(color);
  const hexInputId = useId();
  const [hexDraft, setHexDraft] = useState("");
  const [isEditingHex, setIsEditingHex] = useState(false);

  // Turn a pointer position into saturation and brightness.
  function setColorFromPlane(target: HTMLDivElement, clientX: number, clientY: number) {
    const bounds = target.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }
    const saturation = clamp(((clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const value = clamp(100 - ((clientY - bounds.top) / bounds.height) * 100, 0, 100);
    onChange(hsvToHex({ hue: hsv.hue, saturation, value }));
  }

  function handlePlanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setColorFromPlane(event.currentTarget, event.clientX, event.clientY);
  }

  function handlePlanePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      setColorFromPlane(event.currentTarget, event.clientX, event.clientY);
    }
  }

  function handlePlanePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // Apply a hex color once all six digits are entered.
  function handleHexChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.currentTarget.value.replace(/[^\da-f]/gi, "").slice(0, 6);
    setHexDraft(nextValue);
    const nextColor = normalizeHex(`#${nextValue}`);
    if (nextColor) {
      onChange(nextColor);
    }
  }

  return (
    <div className="accent-color-picker">
      <div className="accent-color-picker-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="accent-color-preview"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <span className="block text-xs font-semibold text-[var(--foreground)]">
              Create your accent
            </span>
            <span className="block truncate text-[11px] text-[var(--muted)]">
              Your hue is tuned automatically for readable text.
            </span>
          </div>
        </div>
        <span className="accent-color-hue-value" aria-hidden="true">
          {Math.round(hsv.hue)}°
        </span>
      </div>

      {/* Drag to choose saturation and brightness. */}
      <div
        className="accent-color-plane"
        aria-hidden="true"
        style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }}
        onPointerDown={handlePlanePointerDown}
        onPointerMove={handlePlanePointerMove}
        onPointerUp={handlePlanePointerUp}
        onPointerCancel={handlePlanePointerUp}
      >
        <span
          className="accent-color-plane-handle"
          style={{ left: `${hsv.saturation}%`, top: `${100 - hsv.value}%` }}
          aria-hidden="true"
        />
      </div>

      <p className="sr-only">Use the following sliders to adjust the color with a keyboard.</p>
      {/* Keyboard-accessible color sliders. */}
      <div className="accent-color-adjustments">
        <label className="accent-color-range-label" htmlFor={`${hexInputId}-hue`}>
          <span>
            Hue <output>{Math.round(hsv.hue)}°</output>
          </span>
          <input
            id={`${hexInputId}-hue`}
            type="range"
            min="0"
            max="359"
            value={Math.round(hsv.hue)}
            onChange={(event) =>
              onChange(hsvToHex({ ...hsv, hue: Number(event.currentTarget.value) }))
            }
            className="accent-color-range accent-color-hue-range"
          />
        </label>
        <label className="accent-color-range-label" htmlFor={`${hexInputId}-saturation`}>
          <span>
            Saturation <output>{Math.round(hsv.saturation)}%</output>
          </span>
          <input
            id={`${hexInputId}-saturation`}
            type="range"
            min="0"
            max="100"
            value={Math.round(hsv.saturation)}
            onChange={(event) =>
              onChange(hsvToHex({ ...hsv, saturation: Number(event.currentTarget.value) }))
            }
            className="accent-color-range"
            style={{
              background: `linear-gradient(90deg, hsl(${hsv.hue} 0% ${hsv.value}%), hsl(${hsv.hue} 100% ${hsv.value}%))`,
            }}
          />
        </label>
        <label className="accent-color-range-label" htmlFor={`${hexInputId}-brightness`}>
          <span>
            Brightness <output>{Math.round(hsv.value)}%</output>
          </span>
          <input
            id={`${hexInputId}-brightness`}
            type="range"
            min="0"
            max="100"
            value={Math.round(hsv.value)}
            onChange={(event) =>
              onChange(hsvToHex({ ...hsv, value: Number(event.currentTarget.value) }))
            }
            className="accent-color-range"
            style={{
              background: `linear-gradient(90deg, #000000, hsl(${hsv.hue} ${hsv.saturation}% 100%))`,
            }}
          />
        </label>
      </div>

      <div className="accent-color-picker-footer">
        <label className="accent-color-hex-field" htmlFor={hexInputId}>
          <span className="sr-only">Hex color</span>
          <span aria-hidden="true">#</span>
          <input
            id={hexInputId}
            value={isEditingHex ? hexDraft : color.slice(1)}
            onFocus={() => {
              setHexDraft(color.slice(1));
              setIsEditingHex(true);
            }}
            onChange={handleHexChange}
            onBlur={() => {
              if (!normalizeHex(`#${hexDraft}`)) {
                setHexDraft(color.slice(1));
              }
              setIsEditingHex(false);
            }}
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby={`${hexInputId}-hint`}
          />
        </label>
        <span id={`${hexInputId}-hint`} className="sr-only">
          Enter a six digit hexadecimal color.
        </span>
        <div className="accent-color-presets" role="group" aria-label="Accent color presets">
          {accentPresets.map((preset) => (
            <button
              key={preset.color}
              type="button"
              className="accent-color-preset"
              style={{ backgroundColor: preset.color, color: readableTextColor(preset.color) }}
              aria-label={`Use ${preset.name}`}
              aria-pressed={selectedAccent === preset.color}
              title={preset.name}
              onClick={() => onChange(preset.color)}
            >
              {selectedAccent === preset.color ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Accept saved hex colors and older preset names.
function resolveAccent(value: string | null): Accent {
  const customColor = normalizeHex(value);
  if (customColor) {
    return customColor;
  }

  return value ? (legacyAccentColors[value.toLowerCase()] ?? null) : null;
}

// Read the saved theme with a browser-safe fallback.
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

// Read the saved accent with a browser-safe fallback.
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

// Listen for appearance changes in this tab and other tabs.
function subscribeToAppearance(callback: () => void) {
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

// Return accent styles to the CSS defaults.
function clearCustomAccentProperties(root: HTMLElement) {
  accentProperties.forEach((property) => root.style.removeProperty(property));
}

// Apply the selected theme and readable accent colors.
function applyAppearance(theme: Theme, accent: Accent) {
  const root = document.documentElement;
  const customColor = normalizeHex(accent);

  root.dataset.theme = theme;

  if (!customColor) {
    root.dataset.accent = "orange";
    clearCustomAccentProperties(root);
    return;
  }

  const tokens = getAccentColors(theme, customColor);
  root.dataset.accent = "custom";
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--accent-hover", tokens.accentHover);
  root.style.setProperty(
    "--accent-soft",
    colorMix(tokens.accent, theme === "light" ? 12 : 17, "transparent"),
  );
  root.style.setProperty("--accent-strong", tokens.accentStrong);
  root.style.setProperty("--accent-strong-hover", tokens.accentStrongHover);
  root.style.setProperty("--accent-text", tokens.accentText);
  root.style.setProperty("--accent-on-strong", tokens.accentOnStrong);
  root.style.setProperty(
    "--border-strong",
    colorMix(tokens.accent, theme === "light" ? 46 : 53, "transparent"),
  );
  root.style.setProperty("--sidebar", tokens.sidebar);
  root.style.setProperty("--sidebar-deep", tokens.sidebarDeep);
}

// Update older saved accent preferences.
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

// Save the device's theme and accent color.
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribeToAppearance, getThemeSnapshot, () => "dark");
  const accent = useSyncExternalStore<Accent>(subscribeToAppearance, getAccentSnapshot, () => null);
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const headingId = useId();

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

  // Apply the choice, save it, and notify the other controls.
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

  function resetAccent() {
    saveAppearance(theme, null);
  }

  const pickerColor = accent ?? defaultAccentColor(theme);
  const accentLabel = accent ? `${accent} custom accent` : "CEIT orange default accent";

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
          className="appearance-popover absolute bottom-14 right-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] shadow-[var(--shadow)]"
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Palette className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id={headingId} className="text-sm font-semibold tracking-tight">
                Appearance
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
                Choose a mode and a personal accent for this device.
              </p>
            </div>
          </div>

          {/* Light and dark mode buttons. */}
          <fieldset className="border-0 p-0">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Mode
            </legend>
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

          {/* Custom accent picker and default-color reset. */}
          <fieldset className="mt-5 border-0 p-0">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Accent color
            </legend>
            <div className="appearance-color-picker">
              <AccentColorPicker
                color={pickerColor}
                selectedAccent={accent}
                onChange={(nextAccent) => saveAppearance(theme, nextAccent)}
              />
              <button
                type="button"
                onClick={resetAccent}
                aria-pressed={accent === null}
                className={`appearance-reset-color mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  accent === null
                    ? "border-[var(--border-strong)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-transparent text-[var(--muted-strong)] hover:border-[var(--border-strong)]"
                }`}
              >
                {accent === null ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                Use CEIT orange default
              </button>
            </div>
          </fieldset>

          <p
            className="sr-only"
            aria-live="polite"
          >{`${theme} mode with ${accentLabel} selected.`}</p>
        </section>
      ) : null}

      {/* Open or close appearance settings. */}
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
