import { DashboardNavigation } from "./dashboard-navigation";
import { CommandMenu } from "../components/command-menu";
import {
  canManageAdministration,
  canManageInventory,
  requireInventoryAccess,
} from "@/lib/inventory-auth";

export const dynamic = "force-dynamic";

// Check sign-in and load the staff navigation.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireInventoryAccess();

  return (
    <>
      <div className="dashboard-shell">
        {/* Staff sidebar and mobile menu. */}
        <DashboardNavigation
          email={user.email}
          username={user.username}
          canManageAdministration={canManageAdministration(user.role)}
          canManageInventory={canManageInventory(user.role)}
        />
        {/* The current dashboard page. */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      {/* Keyboard-accessible dashboard shortcuts. */}
      <CommandMenu
        canManageAdministration={canManageAdministration(user.role)}
        canManageInventory={canManageInventory(user.role)}
      />
    </>
  );
}
