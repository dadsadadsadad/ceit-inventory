"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  HandHelping,
  LayoutDashboard,
  Menu,
  Package,
  ScanLine,
  ScrollText,
  Settings,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";

import { signOut } from "@/app/auth/actions";

type DashboardNavigationProps = {
  canManageAdministration: boolean;
  canManageInventory: boolean;
  email?: string | null;
  username?: string | null;
};

// Show the links allowed for this account.
export function DashboardNavigation({
  canManageAdministration,
  canManageInventory,
  email,
  username,
}: DashboardNavigationProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const accountLabel =
    username && email ? `${username} | ${email}` : username || email || "Signed-in account";
  const navItems = [
    { label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard },
    { label: "Inventory", href: "/dashboard/inventory", Icon: Package },
    ...(canManageInventory
      ? [{ label: "Borrowing", href: "/dashboard/borrowing", Icon: HandHelping }]
      : []),
    ...(canManageInventory
      ? [{ label: "Maintenance", href: "/dashboard/maintenance", Icon: Wrench }]
      : []),
    { label: "Reports", href: "/dashboard/reports", Icon: BarChart3 },
    ...(canManageAdministration
      ? [{ label: "Audit trail", href: "/dashboard/activity", Icon: ScrollText }]
      : []),
    { label: "Scan QR code", href: "/scan", Icon: ScanLine },
    ...(canManageAdministration ? [{ label: "Users", href: "/dashboard/users", Icon: Users }] : []),
    { label: "Settings", href: "/dashboard/settings", Icon: Settings },
  ];

  return (
    <aside className="dashboard-sidebar border-b lg:flex lg:w-72 lg:flex-col lg:self-stretch lg:border-b-0 lg:border-r">
      <div className="px-5 py-5 lg:px-6 lg:py-7">
        <div className="flex items-center gap-3">
          <div className="brand-mark grid h-11 w-11 place-items-center rounded-lg text-sm font-black">
            <Boxes className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">CEIT Inventory</div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">
              Inventory management
            </div>
          </div>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="dashboard-navigation"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMenuOpen(!menuOpen)}
            className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/20 lg:hidden"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <p className="sidebar-section-label hidden lg:block">Workspace</p>
      {/* Links available to this staff account. */}
      <nav
        id="dashboard-navigation"
        className={`${menuOpen ? "block" : "hidden"} px-3 pb-4 lg:block lg:px-4`}
        aria-label="Dashboard navigation"
      >
        <ul className="dashboard-nav-list lg:space-y-1">
          {navItems.map(({ label, href, Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={label} className="dashboard-nav-item lg:shrink">
                <Link
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link mobile-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none ${active ? "nav-link-active" : ""}`}
                >
                  <span className="nav-marker grid h-7 w-7 place-items-center rounded-md text-xs font-semibold">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className={`${menuOpen ? "block" : "hidden"} border-t border-white/10 px-5 py-4 lg:hidden`}
      >
        <div className="flex items-center justify-between gap-4 text-xs text-white/80">
          <span className="truncate">{accountLabel}</span>
          <form action={signOut}>
            <button className="font-semibold underline hover:text-white">Sign out</button>
          </form>
        </div>
      </div>
      {/* Signed-in account and sign-out controls. */}
      <div className="sidebar-account hidden border-t border-white/10 px-5 pb-6 pt-2 lg:block">
        <div className="rounded-lg bg-white/10 p-4">
          <div className="text-sm font-semibold text-white">Signed in</div>
          <div className="mt-1 truncate text-xs leading-5 text-white/70">{accountLabel}</div>
          <form action={signOut} className="mt-3">
            <button className="text-xs font-semibold text-white/90 underline hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
