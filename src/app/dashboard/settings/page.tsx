export const metadata = { title: "Settings · CEIT Inventory" };

import { layoutFor } from "@/lib/dashboard-layout";
import { canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { mailConfigured } from "@/lib/notifications";
import { prisma } from "@/prisma";

import { AccountSettings } from "./_components/account-settings";
import { DashboardLayoutEditor } from "./_components/dashboard-layout-editor";
import { NotificationSettings } from "./_components/notification-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireInventoryAccess();
  const settings = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notifyOn: true, dashboardLayout: true },
  });
  const dashboardLayout = layoutFor(settings?.dashboardLayout, canManageInventory(user.role));

  return (
    <div className="page settings-page">
      <div className="page-inner space-y-6">
        <header>
          <p className="eyebrow">Workspace preferences</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Settings</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Your account, email notifications and dashboard layout.
          </p>
        </header>

        <AccountSettings email={user.email} username={user.username} />
        <NotificationSettings
          email={user.email}
          notifyOn={settings?.notifyOn ?? []}
          mailReady={mailConfigured()}
        />

        <section id="dashboard-layout" className="card rounded-lg p-5 sm:p-6">
          <p className="eyebrow">Dashboard</p>
          <h2 className="mt-2 text-lg font-semibold">Dashboard layout</h2>
          <p className="muted mt-1 max-w-2xl text-sm leading-6">
            Pick which cards show, where they go and how wide they are. Only you see this layout.
          </p>
          <DashboardLayoutEditor
            initial={dashboardLayout}
            defaults={layoutFor(null, canManageInventory(user.role))}
          />
        </section>
      </div>
    </div>
  );
}
