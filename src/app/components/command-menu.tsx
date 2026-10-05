"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  ClipboardList,
  Command,
  HandHelping,
  LayoutDashboard,
  Package,
  PackagePlus,
  ScanLine,
  ScrollText,
  Search,
  Settings2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { searchInventoryQuickly, type QuickSearchItem } from "./quick-search";

type CommandItem = {
  description: string;
  href: string;
  Icon: LucideIcon;
  label: string;
  requires?: "administrator" | "inventory-manager";
};

const commands: CommandItem[] = [
  {
    label: "Open student survey",
    description: "Display the QR code for students to answer the form",
    href: "/dashboard/student-survey",
    Icon: ClipboardList,
  },
  {
    label: "Open dashboard",
    description: "Equipment and requests at a glance",
    href: "/dashboard",
    Icon: LayoutDashboard,
  },
  {
    label: "Browse inventory",
    description: "Search equipment and supplies",
    href: "/dashboard/inventory",
    Icon: Package,
  },
  {
    label: "Browse hardware",
    description: "Which PCs have which processor, memory, storage, and graphics",
    href: "/dashboard/inventory/hardware",
    Icon: Package,
  },
  {
    label: "Browse software",
    description: "Installed programs, the PCs they are on, and license dates",
    href: "/dashboard/inventory/software",
    Icon: Package,
  },
  {
    label: "Print QR labels",
    description: "Print labels for a room or selected items",
    href: "/dashboard/inventory/labels",
    Icon: Package,
  },
  {
    label: "View reservations",
    description: "Approved equipment bookings",
    href: "/dashboard/borrowing?status=RESERVED",
    Icon: HandHelping,
    requires: "inventory-manager",
  },
  {
    label: "Review QR issues",
    description: "Problems reported through equipment labels",
    href: "/dashboard/maintenance?source=QR",
    Icon: Wrench,
    requires: "inventory-manager",
  },
  {
    label: "Scan a QR code",
    description: "Open the camera scanner",
    href: "/scan",
    Icon: ScanLine,
  },
  {
    label: "Add inventory",
    description: "Register an asset or supply",
    href: "/dashboard/inventory/new",
    Icon: PackagePlus,
    requires: "inventory-manager",
  },
  {
    label: "Open borrowing",
    description: "Review equipment lending requests",
    href: "/dashboard/borrowing",
    Icon: HandHelping,
    requires: "inventory-manager",
  },
  {
    label: "Open maintenance",
    description: "Report and resolve maintenance requests",
    href: "/dashboard/maintenance",
    Icon: Wrench,
    requires: "inventory-manager",
  },
  {
    label: "Open audit trail",
    description: "Find changes by item, user, or date",
    href: "/dashboard/activity",
    Icon: ScrollText,
    requires: "inventory-manager",
  },
  {
    label: "Open reports",
    description: "Review current inventory trends",
    href: "/dashboard/reports",
    Icon: BarChart3,
  },
  {
    label: "Manage users",
    description: "Create and update CEIT inventory accounts",
    href: "/dashboard/users",
    Icon: Users,
    requires: "administrator",
  },
  {
    label: "Open settings",
    description: "Update your account and preferences",
    href: "/dashboard/settings",
    Icon: Settings2,
  },
];

type CommandMenuProps = {
  canManageUsers: boolean;
  canManageInventory: boolean;
  embedded?: boolean;
};

type MenuEntry = {
  description: string;
  href: string;
  Icon: LucideIcon;
  key: string;
  label: string;
};

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Search and open common dashboard actions.
export function CommandMenu({
  canManageUsers,
  canManageInventory,
  embedded = false,
}: CommandMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [itemSearch, setItemSearch] = useState<{ items: QuickSearchItem[]; query: string }>({
    items: [],
    query: "",
  });
  const dialogRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const visibleCommands = commands.filter((command) => {
    if (command.requires === "administrator" && !canManageUsers) {
      return false;
    }
    if (command.requires === "inventory-manager" && !canManageInventory) {
      return false;
    }
    return `${command.label} ${command.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });

  // Equipment matches for the typed words. Results are kept with their query so an older answer
  // is never shown for newer text.
  const trimmedQuery = query.trim();
  const equipmentMatches =
    trimmedQuery.length >= 2 && itemSearch.query === trimmedQuery ? itemSearch.items : [];
  const entries: MenuEntry[] = [
    ...visibleCommands.map((command) => ({ ...command, key: command.href })),
    ...equipmentMatches.map((item) => ({
      key: `item-${item.id}`,
      label: item.name,
      description: [item.assetTag, item.location].filter(Boolean).join(" · "),
      href: `/dashboard/inventory/${item.id}`,
      Icon: Package,
    })),
  ];
  const firstEquipmentIndex = visibleCommands.length;
  const selectedIndex = Math.min(activeIndex, Math.max(entries.length - 1, 0));

  // Open the command list with a fresh search.
  function openMenu() {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    setQuery("");
    setActiveIndex(0);
    setIsOpen(true);
  }

  // Close the menu and return focus to its trigger.
  function closeMenu(restoreFocus = true) {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);

    if (restoreFocus) {
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
  }

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isOpen) {
          closeMenu();
        } else {
          openMenu();
        }
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
    if (!isOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      return;
    }
    const term = query.trim();
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const items = await searchInventoryQuickly(term);
        if (current) {
          setItemSearch({ items, query: term });
        }
      } catch {
        if (current) {
          setItemSearch({ items: [], query: term });
        }
      }
    }, 200);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, entries.length]);

  // Close the menu and open the selected destination.
  function openCommand(command: { href: string }) {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
    router.push(command.href);
  }

  // Move through the results with the arrow keys and open the highlighted one with Enter.
  function handleListKeys(event: React.KeyboardEvent<HTMLElement>) {
    if (!entries.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((selectedIndex + 1) % entries.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((selectedIndex - 1 + entries.length) % entries.length);
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      openCommand(entries[selectedIndex]);
    }
  }

  // Handle keyboard navigation inside the command menu.
  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    handleListKeys(event);
    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const focusableElements = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
      (element) => element.getClientRects().length > 0,
    );
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
    } else if (
      !event.shiftKey &&
      (activeElement === lastElement || !dialog.contains(activeElement))
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`command-trigger ${embedded ? "command-embedded" : ""}`}
        onClick={openMenu}
        aria-label="Open quick navigation"
        title="Quick navigation (Ctrl or Cmd + K)"
      >
        <Command className="h-4 w-4" aria-hidden="true" />
        <span>Quick navigation</span>
        <kbd className="command-shortcut hidden sm:inline">Ctrl K</kbd>
      </button>

      {isOpen
        ? createPortal(
            <div
              className="command-menu-backdrop"
              role="presentation"
              onMouseDown={() => closeMenu()}
            >
              {/* Command search dialog. */}
              <section
                ref={dialogRef}
                className="command-menu"
                role="dialog"
                aria-modal="true"
                aria-labelledby="command-menu-title"
                onKeyDown={handleDialogKeyDown}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="command-menu-heading">
                  <div>
                    <p className="eyebrow">Quick navigation</p>
                    <h2 id="command-menu-title" className="mt-1 text-lg font-semibold">
                      Where would you like to go?
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="command-menu-close"
                    onClick={() => closeMenu()}
                    aria-label="Close quick navigation"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <label className="command-menu-search">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Filter quick navigation</span>
                  {/* Filter the available commands. */}
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="command-menu-results"
                    aria-activedescendant={
                      entries.length ? `command-menu-option-${selectedIndex}` : undefined
                    }
                    autoComplete="off"
                    placeholder="Search pages, actions, or equipment…"
                  />
                </label>
                <div
                  ref={listRef}
                  id="command-menu-results"
                  role="listbox"
                  aria-label="Quick navigation results"
                  className="command-menu-list"
                >
                  {entries.length ? (
                    entries.map((entry, index) => (
                      <div key={entry.key} className="contents">
                        {index === firstEquipmentIndex && equipmentMatches.length ? (
                          <p className="command-menu-group muted">Equipment</p>
                        ) : null}
                        <button
                          id={`command-menu-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === selectedIndex}
                          data-active={index === selectedIndex}
                          className="command-menu-item"
                          onClick={() => openCommand({ href: entry.href })}
                          onMouseMove={() => setActiveIndex(index)}
                        >
                          <span className="command-menu-icon">
                            <entry.Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block text-sm font-semibold">{entry.label}</span>
                            <span className="muted mt-0.5 block text-xs">{entry.description}</span>
                          </span>
                          <span className="command-menu-arrow" aria-hidden="true">
                            ↗
                          </span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted px-3 py-8 text-center text-sm">
                      {trimmedQuery.length >= 2
                        ? "No pages or equipment match that search."
                        : "No pages match that search."}
                    </p>
                  )}
                </div>
                <p className="command-menu-footer">
                  <kbd>↑</kbd> <kbd>↓</kbd> to move <span aria-hidden="true">·</span>{" "}
                  <kbd>Enter</kbd> to open <span aria-hidden="true">·</span> <kbd>Esc</kbd> to close
                </p>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
