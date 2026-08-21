"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, HandHelping, LayoutDashboard, Package, ScanLine, Settings, Users, Wrench } from "lucide-react";

import { signOut } from "@/app/auth/actions";

type DashboardNavigationProps = { canManageAdministration: boolean; canManageInventory: boolean; email: string };

export function DashboardNavigation({ canManageAdministration, canManageInventory, email }: DashboardNavigationProps) {
  const pathname = usePathname();
  const navItems = [
    { label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard },
    { label: "Inventory", href: "/dashboard/inventory", Icon: Package },
    ...(canManageInventory ? [{ label: "Borrowing", href: "/dashboard/borrowing", Icon: HandHelping }] : []),
    ...(canManageInventory ? [{ label: "Maintenance", href: "/dashboard/maintenance", Icon: Wrench }] : []),
    { label: "Reports", href: "/dashboard/reports", Icon: BarChart3 },
    { label: "Scan QR", href: "/scan", Icon: ScanLine },
    ...(canManageAdministration ? [
      { label: "Users", href: "/dashboard/users", Icon: Users },
      { label: "Settings", href: "/dashboard/settings", Icon: Settings },
    ] : []),
  ];

  return (
    <aside className="dashboard-sidebar border-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="px-5 py-5 lg:px-6 lg:py-7">
        <div className="flex items-center gap-3">
          <div className="brand-mark grid h-11 w-11 place-items-center rounded-lg text-sm font-black"><Boxes className="h-6 w-6" aria-hidden="true" /></div>
          <div><div className="text-base font-semibold tracking-tight">CEIT Inventory</div><div className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">Inventory management</div></div>
        </div>
      </div>

      <nav className="px-3 pb-4 lg:flex-1 lg:px-4" aria-label="Dashboard navigation">
        <ul className="dashboard-nav-list lg:space-y-1">
          {navItems.map(({ label, href, Icon }) => {
            const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={label} className="dashboard-nav-item lg:shrink">
                <Link href={href} aria-current={active ? "page" : undefined} className={`nav-link mobile-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none ${active ? "nav-link-active" : ""}`}>
                  <span className="nav-marker grid h-7 w-7 place-items-center rounded-md text-xs font-semibold"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-5 py-4 lg:hidden"><div className="flex items-center justify-between gap-4 text-xs text-white/80"><span className="truncate">{email}</span><form action={signOut}><button className="font-semibold underline hover:text-white">Sign out</button></form></div></div>
      <div className="hidden border-t border-white/10 px-5 py-5 lg:block"><div className="rounded-lg bg-white/10 p-4"><div className="text-sm font-semibold text-white">Signed in</div><div className="mt-1 truncate text-xs leading-5 text-white/70">{email}</div><form action={signOut} className="mt-3"><button className="text-xs font-semibold text-white/90 underline hover:text-white">Sign out</button></form></div></div>
    </aside>
  );
}
