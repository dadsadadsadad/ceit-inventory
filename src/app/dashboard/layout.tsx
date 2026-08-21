import { DashboardNavigation } from "./dashboard-navigation";
import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireInventoryAccess();

  return (
    <div className="dashboard-shell">
      <DashboardNavigation email={user.email} canManageAdministration={canManageAdministration(user.role)} canManageInventory={canManageInventory(user.role)} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
