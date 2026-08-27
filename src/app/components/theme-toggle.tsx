"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

type Theme = "dark" | "light";
type Accent = "orange" | "violet" | "blue" | "emerald";

const themeStorageKey = "ceit-theme";
const accentStorageKey = "ceit-accent";
const appearanceChangeEvent = "ceit-appearance-change";

const accentOptions: ReadonlyArray<{
  value: Accent;
  label: string;
  description: string;
  color: string;
}> = [
  { value: "orange", label: "CEIT orange", description: "Warm and familiar", color: "#f97316" },
  { value: "violet", label: "Violet", description: "Focused and expressive", color: "#8b5cf6" },
  { value: "blue", label: "Blue", description: "Clear and calm", color: "#0ea5e9" },
  { value: "emerald", label: "Emerald", description: "Fresh and balanced", color: "#10b981" },
];

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

function isAccent(value: string | null): value is Accent {
  return value === "orange" || value === "violet" || value === "blue" || value === "emerald";
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
    return "orange";
  }

  try {
    const storedAccent = window.localStorage.getItem(accentStorageKey);
    return isAccent(storedAccent) ? storedAccent : "orange";
  } catch {
    const documentAccent = document.documentElement.dataset.accent;
    return documentAccent === "orange" || documentAccent === "violet" || documentAccent === "blue" || documentAccent === "emerald"
      ? documentAccent
      : "orange";
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

function applyAppearance(theme: Theme, accent: Accent) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribeToAppearanceChanges, getThemeSnapshot, () => "dark");
  const accent = useSyncExternalStore<Accent>(subscribeToAppearanceChanges, getAccentSnapshot, () => "orange");
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const headingId = useId();

  useEffect(() => {
    // Read storage again so the first hydration effect never overrides the
    // synchronous bootstrap choice with the server fallback values.
    applyAppearance(getThemeSnapshot(), getAccentSnapshot());
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
      window.localStorage.setItem(accentStorageKey, nextAccent);
    } catch {
      // Appearance choices should still work for the current session when
      // storage is unavailable (for example, in a restricted browser mode).
    }

    window.dispatchEvent(new Event(appearanceChangeEvent));
  }

  function selectTheme(nextTheme: Theme) {
    saveAppearance(nextTheme, accent);
  }

  function selectAccent(nextAccent: Accent) {
    saveAppearance(theme, nextAccent);
  }

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
              <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">Choose a mode and accent for this device.</p>
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
            <div role="group" aria-label="Accent color" className="grid grid-cols-2 gap-2">
              {accentOptions.map((option) => {
                const isSelected = accent === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectAccent(option.value)}
                    className={`appearance-color-option flex min-h-14 items-center gap-2 rounded-xl border px-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                      isSelected
                        ? "border-[var(--border-strong)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-transparent hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border-2 border-white/70 shadow-sm"
                      style={{ backgroundColor: option.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-[var(--foreground)]">{option.label}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">{option.description}</span>
                    </span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="sr-only" aria-live="polite">{`${theme} mode with ${accent} accent selected.`}</p>
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
