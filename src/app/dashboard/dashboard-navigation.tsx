"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
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
import { LiveUpdates } from "@/app/components/live-updates";
import { CommandMenu } from "@/app/components/command-menu";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { BrandMark } from "@/app/components/brand-mark";

type DashboardNavigationProps = {
  canManageAdministration: boolean;
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
  canManageAdministration,
  canManageInventory,
  email,
  username,
}: DashboardNavigationProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
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
        { label: "Student survey", href: "/dashboard/student-survey", Icon: ClipboardList },
        ...(canManageAdministration
          ? [
              { label: "Audit trail", href: "/dashboard/activity", Icon: ScrollText },
              { label: "Users", href: "/dashboard/users", Icon: Users },
            ]
          : []),
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
                  return (
                    <li key={href} className="dashboard-nav-item">
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
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-utilities">
          <CommandMenu
            canManageAdministration={canManageAdministration}
            canManageInventory={canManageInventory}
            embedded
          />
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
                {canManageAdministration ? "Administrator" : "Staff"}
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
