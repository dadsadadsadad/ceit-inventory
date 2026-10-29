export const metadata = { title: "Settings · CEIT Inventory" };

import { requireInventoryAccess } from "@/lib/inventory-auth";
import { mailConfigured } from "@/lib/notifications";
import { prisma } from "@/prisma";

import { AccountSettings } from "./_components/account-settings";
import { NotificationSettings } from "./_components/notification-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireInventoryAccess();
  const settings = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      notifyLater: true,
      notifyOn: true,
      summaryDay: true,
      summaryFrequency: true,
      summaryTime: true,
    },
  });

  return (
    <div className="page settings-page">
      <div className="page-inner space-y-6">
        <header>
          <h1 className="title text-3xl sm:text-4xl">Settings</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Your account, password and email notifications.
          </p>
        </header>

        <AccountSettings email={user.email} username={user.username} />
        <NotificationSettings
          email={user.email}
          notifyOn={settings?.notifyOn ?? []}
          notifyLater={settings?.notifyLater ?? []}
          summaryDay={settings?.summaryDay ?? 1}
          summaryFrequency={settings?.summaryFrequency ?? "daily"}
          summaryTime={settings?.summaryTime ?? "morning"}
          mailReady={mailConfigured()}
        />
      </div>
    </div>
  );
}
