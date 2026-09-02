"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Command, HandHelping, LayoutDashboard, Package, PackagePlus, ScanLine, ScrollText, Search, Settings2, Users, Wrench, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";

type CommandItem = {
  description: string;
  href: string;
  Icon: LucideIcon;
  label: string;
  requires?: "administrator" | "inventory-manager";
};

const commands: CommandItem[] = [
  { label: "Open dashboard", description: "See the live CEIT overview", href: "/dashboard", Icon: LayoutDashboard },
  { label: "Browse inventory", description: "Search equipment and supplies", href: "/dashboard/inventory", Icon: Package },
  { label: "Scan a QR code", description: "Open the camera scanner", href: "/scan", Icon: ScanLine },
  { label: "Add inventory", description: "Register an asset or supply", href: "/dashboard/inventory/new", Icon: PackagePlus, requires: "inventory-manager" },
  { label: "Open borrowing", description: "Review equipment lending requests", href: "/dashboard/borrowing", Icon: HandHelping, requires: "inventory-manager" },
  { label: "Open maintenance", description: "Report and resolve maintenance requests", href: "/dashboard/maintenance", Icon: Wrench, requires: "inventory-manager" },
  { label: "Open audit trail", description: "Search the complete inventory activity history", href: "/dashboard/activity", Icon: ScrollText, requires: "administrator" },
  { label: "Open reports", description: "Review current inventory trends", href: "/dashboard/reports", Icon: BarChart3 },
  { label: "Manage users", description: "Create and update CEIT inventory accounts", href: "/dashboard/users", Icon: Users, requires: "administrator" },
  { label: "Open settings", description: "Update your account and preferences", href: "/dashboard/settings", Icon: Settings2 },
];

type CommandMenuProps = { canManageAdministration: boolean; canManageInventory: boolean };

const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

export function CommandMenu({ canManageAdministration, canManageInventory }: CommandMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const visibleCommands = commands.filter((command) => {
    if (command.requires === "administrator" && !canManageAdministration) return false;
    if (command.requires === "inventory-manager" && !canManageInventory) return false;
    return `${command.label} ${command.description}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  function openMenu() {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    setQuery("");
    setIsOpen(true);
  }

  function closeMenu(restoreFocus = true) {
    setIsOpen(false);
    setQuery("");

    if (restoreFocus) {
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
  }

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isOpen) closeMenu();
        else openMenu();
      }

      if (isOpen && event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  function openCommand(command: CommandItem) {
    closeMenu(false);
    router.push(command.href);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableElements = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      .filter((element) => element.getClientRects().length > 0);
    if (!focusableElements.length) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="command-trigger"
        onClick={openMenu}
        aria-label="Open quick navigation"
        title="Quick navigation (Ctrl or Cmd + K)"
      >
        <Command className="h-4 w-4" aria-hidden="true" />
        <span className="hidden text-xs font-bold sm:inline">Quick nav</span>
        <kbd className="command-shortcut hidden sm:inline">⌘ K</kbd>
      </button>

      {isOpen ? (
        <div className="command-menu-backdrop" role="presentation" onMouseDown={() => closeMenu()}>
          <section ref={dialogRef} className="command-menu" role="dialog" aria-modal="true" aria-labelledby="command-menu-title" onKeyDown={handleDialogKeyDown} onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-menu-heading">
              <div>
                <p className="eyebrow">Quick navigation</p>
                <h2 id="command-menu-title" className="mt-1 text-lg font-semibold">Where would you like to go?</h2>
              </div>
              <button type="button" className="command-menu-close" onClick={() => closeMenu()} aria-label="Close quick navigation">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <label className="command-menu-search">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Filter quick navigation</span>
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and actions…" />
            </label>
            <div className="command-menu-list">
              {visibleCommands.length ? visibleCommands.map((command) => (
                <button key={command.href} type="button" className="command-menu-item" onClick={() => openCommand(command)}>
                  <span className="command-menu-icon"><command.Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold">{command.label}</span><span className="muted mt-0.5 block text-xs">{command.description}</span></span>
                  <span className="command-menu-arrow" aria-hidden="true">↗</span>
                </button>
              )) : <p className="muted px-3 py-8 text-center text-sm">No pages match that search.</p>}
            </div>
            <p className="command-menu-footer"><kbd>Esc</kbd> to close <span aria-hidden="true">·</span> choose a destination to continue</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
