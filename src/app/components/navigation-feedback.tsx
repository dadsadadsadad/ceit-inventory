"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// shows the top progress bar as soon as an internal link is clicked (css on html[data-navigating])
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
        // same page with new params or hash, no bar needed
        link.pathname === window.location.pathname
      ) {
        return;
      }
      root.setAttribute("data-navigating", "true");
      // clear it if navigation fails
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
