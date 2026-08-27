"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Clock3, Command, LayoutDashboard, Package, PackagePlus, ScanLine, Search, Settings2, X } from "lucide-react";
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
  { label: "Scan a QR label", description: "Open the camera scanner", href: "/scan", Icon: ScanLine },
  { label: "Add inventory", description: "Register an asset or supply", href: "/dashboard/inventory/new", Icon: PackagePlus, requires: "inventory-manager" },
  { label: "View activity", description: "Review recent edits and scans", href: "/dashboard/activity", Icon: Clock3 },
  { label: "Open reports", description: "Review current inventory trends", href: "/dashboard/reports", Icon: BarChart3 },
  { label: "Open settings", description: "Manage rooms and categories", href: "/dashboard/settings", Icon: Settings2, requires: "administrator" },
];

type CommandMenuProps = { canManageAdministration: boolean; canManageInventory: boolean };

export function CommandMenu({ canManageAdministration, canManageInventory }: CommandMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const visibleCommands = commands.filter((command) => {
    if (command.requires === "administrator" && !canManageAdministration) return false;
    if (command.requires === "inventory-manager" && !canManageInventory) return false;
    return `${command.label} ${command.description}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  function openMenu() {
    setQuery("");
    setIsOpen(true);
  }

  function closeMenu() {
    setIsOpen(false);
    setQuery("");
  }

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isOpen) closeMenu();
        else openMenu();
      }

      if (event.key === "Escape") closeMenu();
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
    closeMenu();
    router.push(command.href);
  }

  return (
    <>
      <button
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
        <div className="command-menu-backdrop" role="presentation" onMouseDown={closeMenu}>
          <section className="command-menu" role="dialog" aria-modal="true" aria-labelledby="command-menu-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-menu-heading">
              <div>
                <p className="eyebrow">Quick navigation</p>
                <h2 id="command-menu-title" className="mt-1 text-lg font-semibold">Where would you like to go?</h2>
              </div>
              <button type="button" className="command-menu-close" onClick={closeMenu} aria-label="Close quick navigation">
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
