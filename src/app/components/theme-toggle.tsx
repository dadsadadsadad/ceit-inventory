"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

const storageKey = "ceit-theme";

function getThemeSnapshot(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.localStorage.getItem(storageKey) === "light" ? "light" : "dark";
}

function subscribeToThemeChanges(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("ceit-theme-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("ceit-theme-change", callback);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToThemeChanges, getThemeSnapshot, () => "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";

  function toggleTheme() {
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
    window.dispatchEvent(new Event("ceit-theme-change"));
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle grid h-12 w-12 place-items-center rounded-full transition-transform hover:-translate-y-0.5 focus:outline-none cursor-pointer"
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {nextTheme === "light" ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
