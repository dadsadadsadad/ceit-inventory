"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const interactiveSelector = "a, button, input, select, textarea, label, summary, [data-row-navigation-ignore]";

export function InventoryRowNavigation() {
  const router = useRouter();

  useEffect(() => {
    function itemRowFromTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement) || target.closest(interactiveSelector)) return null;
      return target.closest<HTMLElement>("[data-inventory-row-url]");
    }

    function openItemRow(target: EventTarget | null) {
      const row = itemRowFromTarget(target);
      const href = row?.dataset.inventoryRowUrl;
      if (href) router.push(href);
    }

    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      openItemRow(event.target);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = itemRowFromTarget(event.target);
      if (!row) return;
      event.preventDefault();
      openItemRow(row);
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [router]);

  return null;
}
