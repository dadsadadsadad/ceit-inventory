"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  HandHelping,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Package,
  ScanLine,
  ScrollText,
  Settings,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { roleLabel } from "@/lib/roles";
import { LiveUpdates } from "@/app/components/live-updates";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { BrandMark } from "@/app/components/brand-mark";

type DashboardNavigationProps = {
  canManageUsers: boolean;
  canManageInventory: boolean;
  email?: string | null;
  username?: string | null;
};

function NavigationProgress() {
  const { pending } = useLinkStatus();
  return pending ? (
    <LoaderCircle className="nav-progress h-4 w-4 animate-spin" aria-label="Loading page" />
  ) : null;
}

export function DashboardNavigation({
  canManageUsers,
  canManageInventory,
  email,
  username,
}: DashboardNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const inInventory = pathname.startsWith("/dashboard/inventory");
  const [inventoryOpen, setInventoryOpen] = useState(inInventory);
  const [lastInInventory, setLastInInventory] = useState(inInventory);
  if (inInventory !== lastInInventory) {
    setLastInInventory(inInventory);
    setInventoryOpen(inInventory);
  }
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  const pcView = searchParams.get("view") === "pcs";
  const inventoryLinks = [
    {
      label: "All items",
      href: "/dashboard/inventory",
      active:
        pathname === "/dashboard/inventory" ||
        /^\/dashboard\/inventory\/[0-9a-f-]{36}/.test(pathname),
    },
    {
      label: "PCs",
      href: "/dashboard/inventory/hardware?view=pcs",
      active: pathname === "/dashboard/inventory/hardware" && pcView,
    },
    {
      label: "Hardware",
      href: "/dashboard/inventory/hardware",
      active: pathname === "/dashboard/inventory/hardware" && !pcView,
    },
    {
      label: "Software",
      href: "/dashboard/inventory/software",
      active: pathname === "/dashboard/inventory/software",
    },
    {
      label: "QR labels",
      href: "/dashboard/inventory/labels",
      active: pathname === "/dashboard/inventory/labels",
    },
    ...(canManageInventory
      ? [
          {
            label: "Add or import",
            href: "/dashboard/inventory/new",
            active:
              pathname === "/dashboard/inventory/new" || pathname === "/dashboard/inventory/import",
          },
        ]
      : []),
    {
      label: "Rooms and categories",
      href: "/dashboard/inventory/setup",
      active: pathname === "/dashboard/inventory/setup",
    },
  ];

  const groups = [
    {
      label: "Daily work",
      items: [
        { label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard },
        { label: "Inventory", href: "/dashboard/inventory", Icon: Package },
        ...(canManageInventory
          ? [
              { label: "Borrowing", href: "/dashboard/borrowing", Icon: HandHelping },
              { label: "Maintenance", href: "/dashboard/maintenance", Icon: Wrench },
            ]
          : []),
        { label: "Scan QR code", href: "/scan", Icon: ScanLine },
      ],
    },
    {
      label: "Management",
      items: [
        { label: "Reports", href: "/dashboard/reports", Icon: BarChart3 },
        ...(canManageInventory
          ? [{ label: "Audit trail", href: "/dashboard/activity", Icon: ScrollText }]
          : []),
        ...(canManageUsers ? [{ label: "Users", href: "/dashboard/users", Icon: Users }] : []),
        { label: "Settings", href: "/dashboard/settings", Icon: Settings },
      ],
    },
  ];

  return (
    <aside className="dashboard-sidebar border-b lg:flex lg:w-64 lg:flex-col lg:self-stretch lg:border-b-0 lg:border-r">
      <div className="sidebar-brand">
        <Link href="/dashboard" className="brand-lockup" aria-label="CEIT Inventory dashboard">
          <BrandMark />
          <span>
            <strong>
              CEIT
              <span className="brand-wordmark-dot" aria-hidden="true">
                .
              </span>
            </strong>
            <span className="brand-caption">Inventory workspace</span>
          </span>
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="dashboard-navigation"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMenuOpen(!menuOpen)}
          className="mobile-menu-toggle lg:hidden"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div id="dashboard-navigation" className={`sidebar-content ${menuOpen ? "is-open" : ""}`}>
        <nav aria-label="Dashboard navigation">
          {groups.map((group) => (
            <div className="navigation-group" key={group.label}>
              <p className="sidebar-section-label">{group.label}</p>
              <ul className="dashboard-nav-list">
                {group.items.map(({ label, href, Icon }) => {
                  const active =
                    href === "/dashboard"
                      ? pathname === href
                      : pathname === href || pathname.startsWith(`${href}/`);
                  const isInventory = href === "/dashboard/inventory";
                  return (
                    <li
                      key={href}
                      className={`dashboard-nav-item ${isInventory ? "has-subnav" : ""}`}
                    >
                      <Link
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`nav-link mobile-nav-link ${active ? "nav-link-active" : ""}`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        <span>{label}</span>
                        <NavigationProgress />
                      </Link>
                      {isInventory ? (
                        <>
                          <button
                            type="button"
                            className="subnav-toggle"
                            aria-expanded={inventoryOpen}
                            aria-controls="inventory-subnav"
                            aria-label={
                              inventoryOpen ? "Hide inventory pages" : "Show inventory pages"
                            }
                            onClick={() => setInventoryOpen(!inventoryOpen)}
                          >
                            <ChevronDown size={16} aria-hidden="true" />
                          </button>
                          <ul
                            id="inventory-subnav"
                            className="dashboard-subnav"
                            hidden={!inventoryOpen}
                          >
                            {inventoryLinks.map((link) => (
                              <li key={link.href}>
                                <Link
                                  href={link.href}
                                  onClick={() => setMenuOpen(false)}
                                  aria-current={link.active ? "page" : undefined}
                                  className={`subnav-link ${link.active ? "subnav-link-active" : ""}`}
                                >
                                  <span>{link.label}</span>
                                  <NavigationProgress />
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-utilities">
          <ThemeToggle embedded />
        </div>
        <div className="sidebar-account">
          <div className="sidebar-account-line">
            <span className="account-initial" aria-hidden="true">
              {(username || email || "C").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate">{username || email || "Staff account"}</strong>
              <span className="account-role">
                {roleLabel(canManageUsers ? "ADMINISTRATOR" : "STAFF")}
              </span>
            </div>
            <form action={signOut}>
              <button className="sidebar-signout">Sign out</button>
            </form>
          </div>
          <LiveUpdates />
        </div>
      </div>
    </aside>
  );
}
