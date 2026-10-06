"use client";

import { Check, MonitorSmartphone, Moon, Palette, RotateCcw, Sun, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  type Accent,
  type ContrastLevel,
  type CornerStyle,
  type DisplayPreferences,
  type ModeChoice,
  type MotionLevel,
  type TextSize,
  type Theme,
  type TitleFont,
  accentStorageKey,
  appearanceChangeEvent,
  accentPresets,
  legacyAccentColors,
  accentProperties,
  clamp,
  defaultAccentColor,
  defaultPreferences,
  getAccentColors,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  parsePreferences,
  preferenceAttributes,
  preferenceKeys,
  readableTextColor,
  resolveTheme,
  toneChoices,
  toneLabels,
} from "@/lib/appearance";

// Color picker controls.
type AccentColorPickerProps = {
  color: string;
  onChange: (color: string) => void;
};

// Choose a color with sliders, presets, or a hex value.
function AccentColorPicker({ color, onChange }: AccentColorPickerProps) {
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
            <span className="block text-xs text-[var(--muted)]">
              Adjusted for readable text in either mode.
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

// Preferences are read straight from storage. If storage is blocked, choices made in this visit
// are remembered here so they still work until the page is closed.
const sessionValues: Record<string, string> = {};

function readSaved(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return sessionValues[key] ?? null;
  }
}

let cachedPreferencesKey = "";
let cachedPreferences: DisplayPreferences = defaultPreferences;

// The same object is returned until a saved choice changes, as useSyncExternalStore requires.
function getPreferencesSnapshot(): DisplayPreferences {
  if (typeof window === "undefined") {
    return defaultPreferences;
  }
  const next = parsePreferences(readSaved);
  const key = JSON.stringify(next);
  if (key !== cachedPreferencesKey) {
    cachedPreferencesKey = key;
    cachedPreferences = next;
  }
  return cachedPreferences;
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

const darkQuery = "(prefers-color-scheme: dark)";

function subscribeToDevice(callback: () => void) {
  const query = window.matchMedia(darkQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getDeviceIsDark() {
  return window.matchMedia(darkQuery).matches;
}

function colorMix(color: string, percentage: number, mixWith: string) {
  return `color-mix(in srgb, ${color} ${percentage}%, ${mixWith})`;
}

// Return accent styles to the CSS defaults.
function clearCustomAccentProperties(root: HTMLElement) {
  accentProperties.forEach((property) => root.style.removeProperty(property));
}

// Apply the chosen look: the display choices as attributes, then the readable accent colors.
function applyAppearance(preferences: DisplayPreferences, theme: Theme, accent: Accent) {
  const root = document.documentElement;
  const customColor = normalizeHex(accent);

  root.dataset.theme = theme;
  for (const [name, value] of Object.entries(preferenceAttributes(preferences, theme))) {
    if (value) {
      root.setAttribute(name, value);
    } else {
      root.removeAttribute(name);
    }
  }

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

type SegmentOption<T extends string> = { icon?: ReactNode; label: string; value: T };

// A row of choices where exactly one is on, such as Light, Dark, or Auto.
function Segmented<T extends string>({
  className = "",
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  value: T;
}) {
  return (
    <fieldset className={`appearance-field ${className}`}>
      <legend className="appearance-label">{label}</legend>
      <div
        className="appearance-segments"
        role="group"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className="appearance-segment appearance-mode-button"
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Save the device's look: mode, background, accent color, and display choices.
export function ThemeToggle({ embedded = false }: { embedded?: boolean }) {
  const preferences = useSyncExternalStore<DisplayPreferences>(
    subscribeToAppearance,
    getPreferencesSnapshot,
    () => defaultPreferences,
  );
  const accent = useSyncExternalStore<Accent>(subscribeToAppearance, getAccentSnapshot, () => null);
  const deviceIsDark = useSyncExternalStore(subscribeToDevice, getDeviceIsDark, () => false);
  const theme = resolveTheme(preferences.mode, deviceIsDark);
  const tone = theme === "dark" ? preferences.toneDark : preferences.toneLight;
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const headingId = useId();

  useEffect(() => {
    // Read storage again so the first hydration effect never overrides the
    // synchronous bootstrap choice with the server fallback values.
    const currentPreferences = getPreferencesSnapshot();
    const currentAccent = getAccentSnapshot();
    applyAppearance(
      currentPreferences,
      resolveTheme(currentPreferences.mode, getDeviceIsDark()),
      currentAccent,
    );
    migrateAccentStorage(currentAccent);
  }, [preferences, theme, accent]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeRef.current?.focus({ preventScroll: true });

    function closeOnOutsidePress(event: Event) {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("focusin", closeOnOutsidePress);
    // Handle the panel before the mobile navigation's Escape listener.
    document.addEventListener("keydown", closeOnEscape, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("focusin", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isOpen]);

  // Apply the choice, save it, and notify the other controls.
  function saveAppearance(changes: Partial<DisplayPreferences>, nextAccent: Accent = accent) {
    const next = { ...preferences, ...changes };
    applyAppearance(next, resolveTheme(next.mode, getDeviceIsDark()), nextAccent);

    try {
      for (const key of Object.keys(changes) as (keyof DisplayPreferences)[]) {
        const storageKey = preferenceKeys[key];
        sessionValues[storageKey] = next[key];
        // The mode is always saved; the rest only when they differ from the standard look.
        if (key !== "mode" && next[key] === defaultPreferences[key]) {
          window.localStorage.removeItem(storageKey);
        } else {
          window.localStorage.setItem(storageKey, next[key]);
        }
      }

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

  function resetEverything() {
    // Each tone is reset in the key it is saved under, so both modes return to their standard.
    saveAppearance({ ...defaultPreferences }, null);
  }

  const pickerColor = accent ?? defaultAccentColor(theme);
  const accentLabel = accent ? `${accent} custom accent` : "CEIT orange default accent";
  const toneKey = theme === "dark" ? "toneDark" : "toneLight";

  return (
    <div className={`appearance-control ${embedded ? "appearance-embedded" : "appearance-public"}`}>
      {isOpen
        ? createPortal(
            <section
              ref={panelRef}
              id={dialogId}
              role="dialog"
              aria-modal="false"
              aria-labelledby={headingId}
              className={`appearance-popover ${embedded ? "appearance-popover-embedded" : ""} text-[var(--foreground)]`}
            >
              <div className="appearance-heading">
                <span className="appearance-heading-icon" aria-hidden="true">
                  <Palette className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={headingId} className="appearance-title">
                    Appearance
                  </h2>
                  <p className="appearance-note">Saved on this device.</p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  className="appearance-close"
                  aria-label="Close appearance panel"
                  onClick={() => {
                    setIsOpen(false);
                    triggerRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <Segmented<ModeChoice>
                label="Mode"
                value={preferences.mode}
                onChange={(mode) => saveAppearance({ mode })}
                options={[
                  { value: "light", label: "Light", icon: <Sun size={16} aria-hidden="true" /> },
                  { value: "dark", label: "Dark", icon: <Moon size={16} aria-hidden="true" /> },
                  {
                    value: "auto",
                    label: "Auto",
                    icon: <MonitorSmartphone size={16} aria-hidden="true" />,
                  },
                ]}
              />

              {/* The standard background and two alternatives for the mode that is showing. */}
              <fieldset className="appearance-field">
                <legend className="appearance-label">Background</legend>
                <div className="appearance-tones" role="group" aria-label="Background">
                  {toneChoices[theme].map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className="appearance-tone"
                      aria-pressed={tone === choice}
                      onClick={() => saveAppearance({ [toneKey]: choice })}
                    >
                      <span
                        className="appearance-tone-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${toneLabels[choice].swatch[0]} 50%, ${toneLabels[choice].swatch[1]} 50%)`,
                        }}
                        aria-hidden="true"
                      />
                      {toneLabels[choice].label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Presets in one row; anything else is a custom color. */}
              <fieldset className="appearance-field">
                <legend className="appearance-label">Accent color</legend>
                <div
                  className="accent-color-presets"
                  role="group"
                  aria-label="Accent color presets"
                >
                  <button
                    type="button"
                    className="accent-color-preset"
                    style={{ backgroundColor: defaultAccentColor(theme), color: "#ffffff" }}
                    aria-label="Use CEIT orange default"
                    aria-pressed={accent === null}
                    title="CEIT orange"
                    onClick={() => saveAppearance({}, null)}
                  >
                    {accent === null ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </button>
                  {accentPresets.map((preset) => (
                    <button
                      key={preset.color}
                      type="button"
                      className="accent-color-preset"
                      style={{
                        backgroundColor: preset.color,
                        color: readableTextColor(preset.color),
                      }}
                      aria-label={`Use ${preset.name}`}
                      aria-pressed={accent === preset.color}
                      title={preset.name}
                      onClick={() => saveAppearance({}, preset.color)}
                    >
                      {accent === preset.color ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
                <details className="appearance-disclosure">
                  <summary>Custom color</summary>
                  <div className="appearance-color-picker">
                    <AccentColorPicker
                      color={pickerColor}
                      onChange={(nextAccent) => saveAppearance({}, nextAccent)}
                    />
                  </div>
                </details>
              </fieldset>

              <details className="appearance-disclosure appearance-more">
                <summary>
                  More options
                  <small>Text size, corners, titles, contrast, motion</small>
                </summary>
                <Segmented<TextSize>
                  label="Text size"
                  value={preferences.text}
                  onChange={(text) => saveAppearance({ text })}
                  options={[
                    { value: "default", label: "Default" },
                    { value: "large", label: "Large" },
                    { value: "larger", label: "Larger" },
                  ]}
                />
                <Segmented<CornerStyle>
                  label="Corners"
                  value={preferences.corners}
                  onChange={(corners) => saveAppearance({ corners })}
                  options={[
                    { value: "sharp", label: "Sharp" },
                    { value: "default", label: "Default" },
                    { value: "round", label: "Round" },
                  ]}
                />
                <Segmented<TitleFont>
                  label="Titles"
                  value={preferences.titles}
                  onChange={(titles) => saveAppearance({ titles })}
                  options={[
                    { value: "serif", label: "Serif" },
                    { value: "sans", label: "Sans" },
                  ]}
                />
                <Segmented<ContrastLevel>
                  label="Contrast"
                  value={preferences.contrast}
                  onChange={(contrast) => saveAppearance({ contrast })}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "high", label: "High" },
                  ]}
                />
                <Segmented<MotionLevel>
                  label="Motion"
                  value={preferences.motion}
                  onChange={(motion) => saveAppearance({ motion })}
                  options={[
                    { value: "full", label: "Full" },
                    { value: "reduced", label: "Reduced" },
                  ]}
                />
              </details>

              <button type="button" className="appearance-reset" onClick={resetEverything}>
                <RotateCcw size={15} aria-hidden="true" />
                Reset appearance
              </button>

              <p className="sr-only" aria-live="polite">
                {`${theme} mode, ${toneLabels[tone].label} background, ${accentLabel} selected.`}
              </p>
            </section>,
            document.body,
          )
        : null}

      {/* Open or close appearance settings. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="appearance-trigger rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] shadow-[var(--shadow)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label={isOpen ? "Close appearance settings" : "Open appearance settings"}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={isOpen}
        title="Appearance settings"
      >
        <Palette className="h-5 w-5" aria-hidden="true" />
        <span>Appearance</span>
      </button>
    </div>
  );
}

// Staff pages keep preferences with the account controls in the sidebar.
export function GlobalAppearance() {
  const pathname = usePathname();
  return pathname.startsWith("/dashboard") ? null : <ThemeToggle />;
}
