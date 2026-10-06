"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Shows a thin progress bar the moment a link to another page is pressed, before the server has
 * answered, so every click gets an immediate response (including on a phone, where the menu
 * closes and there is no other cue). The bar is a CSS rule on `html[data-navigating]`; this
 * component only switches the attribute on when an internal link is pressed and off when the new
 * page arrives.
 */
export function NavigationFeedback() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute("data-navigating");
    let timeout: ReturnType<typeof setTimeout> | undefined;

    function pressed(event: MouseEvent) {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }
      if (
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download") ||
        link.origin !== window.location.origin ||
        // Changing only the filters or the hash is already instant and shows its own state.
        link.pathname === window.location.pathname
      ) {
        return;
      }
      root.setAttribute("data-navigating", "true");
      // A cancelled or failed navigation must not leave the bar running.
      clearTimeout(timeout);
      timeout = setTimeout(() => root.removeAttribute("data-navigating"), 10_000);
    }

    document.addEventListener("click", pressed, true);
    return () => {
      document.removeEventListener("click", pressed, true);
      clearTimeout(timeout);
    };
  }, [pathname]);

  return null;
}
