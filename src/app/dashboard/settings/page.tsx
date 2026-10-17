export const metadata = { title: "Settings · CEIT Inventory" };

import { requireInventoryAccess } from "@/lib/inventory-auth";

import { AccountSettings } from "./_components/account-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireInventoryAccess();

  return (
    <div className="page settings-page">
      <div className="page-inner space-y-6">
        <header>
          <p className="eyebrow">Workspace preferences</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Settings</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Your account details and password.
          </p>
        </header>

        <AccountSettings email={user.email} username={user.username} />
      </div>
    </div>
  );
}
