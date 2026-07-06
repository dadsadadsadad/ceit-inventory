import Link from "next/link";
import { Boxes, LayoutDashboard, Package, Settings, Users } from "lucide-react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Sidebar links and their matching Lucide icons.
    const navItems = [
        { label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard },
        { label: "Inventory", href: "/dashboard/inventory", Icon: Package },
        { label: "Users", href: "/dashboard/users", Icon: Users },
        { label: "Settings", href: "/dashboard/settings", Icon: Settings },
    ];

    return (
        <div className="dashboard-shell">
            {/* Left navigation area for dashboard pages. */}
            <aside className="dashboard-sidebar border-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
                <div className="px-5 py-5 lg:px-6 lg:py-7">
                    <div className="flex items-center gap-3">
                        {/* Small logo mark beside the app name. */}
                        <div className="brand-mark grid h-11 w-11 place-items-center rounded-lg text-sm font-black">
                            <Boxes className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <div>
                            <div className="text-base font-semibold tracking-tight">CEIT Inventory</div>
                            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">
                                Inventory Management
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main dashboard navigation links. */}
                <nav className="px-3 pb-4 lg:flex-1 lg:px-4">
                    <ul className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">
                        {navItems.map(({ label, href, Icon }) => (
                            <li key={label} className="shrink-0 lg:shrink">
                                <Link
                                    href={href}
                                    className="nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 active:bg-slate-10"
                                >
                                    <span className="nav-marker grid h-7 w-7 place-items-center rounded-md text-xs font-semibold">
                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <span>{label}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Small status card at the bottom of the sidebar. */}
                <div className="hidden border-t border-white/10 px-5 py-5 lg:block">
                    <div className="rounded-lg bg-white/10 p-4">
                        <div className="text-sm font-semibold text-white">System status</div>
                        <div className="mt-1 text-xs leading-5 text-white/70">
                            Core pages are ready for inventory setup.
                        </div>
                    </div>
                </div>
            </aside>

            {/* Page content renders here. */}
            <main className="min-w-0 flex-1">
                {children}
            </main>
        </div>
    );
}
