export const metadata = { title: "Settings · CEIT Inventory" };

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

import { createCategory, createLocation } from "./actions";
import { AccountSettings } from "./_components/account-settings";
import { CategoryEditor } from "./_components/category-editor";
import { LocationEditor } from "./_components/location-editor";

export const dynamic = "force-dynamic";

// Load account settings, categories, and rooms.
export default async function SettingsPage() {
  const user = await requireInventoryAccess();
  const setup = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.location.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return (
    <div className="page settings-page">
      <div className="page-inner space-y-6">
        {/* Settings page title. */}
        <header>
          <p className="eyebrow">Workspace preferences</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Settings</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Update your account, and manage the rooms and categories used by inventory records.
          </p>
        </header>

        <AccountSettings email={user.email} username={user.username} />

        <>
          <section>
            <p className="eyebrow">Inventory setup</p>
            <h2 className="mt-2 text-xl font-semibold">Locations and categories</h2>
            <p className="muted mt-1 max-w-2xl text-sm leading-6">
              Inactive rooms and categories stay on existing records. Tag codes are used in{" "}
              <code>INV-CAT-ST-ROOM-0001</code> asset tags generated for new equipment.
            </p>
          </section>
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Create and edit rooms. */}
            <section className="card rounded-lg p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Rooms and locations</h3>
              <details className="section-disclosure mt-5">
                <summary className="accent-link cursor-pointer text-sm font-semibold">
                  Add location
                </summary>
                <FeedbackForm
                  action={createLocation}
                  createPreview={{
                    titleField: "name",
                    detailFields: ["assetTagCode", "description"],
                  }}
                  className="mt-5 space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="text-sm font-semibold">Location name *</span>
                      <input
                        required
                        name="name"
                        maxLength={255}
                        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                        placeholder="Computer Laboratory 1"
                      />
                    </label>
                    <label>
                      <span className="text-sm font-semibold">Room number</span>
                      <input
                        name="roomNumber"
                        maxLength={100}
                        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                        placeholder="CEIT-201"
                      />
                    </label>
                    <label>
                      <span className="text-sm font-semibold">Asset-tag room code</span>
                      <input
                        name="assetTagCode"
                        maxLength={2}
                        pattern="[0-9]{2}"
                        title="Use two digits, such as 05."
                        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                        placeholder="Auto"
                      />
                      <span className="muted mt-1 block text-xs">
                        Leave empty to assign the next available two-digit code.
                      </span>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-sm font-semibold">Description</span>
                    <input
                      name="description"
                      maxLength={2_000}
                      className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                    />
                  </label>
                  <SubmitButton
                    pendingLabel="Adding location…"
                    className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                  >
                    Add location
                  </SubmitButton>
                </FeedbackForm>
              </details>
              <div className="divider mt-6 space-y-3 border-t pt-5">
                <h4 className="text-sm font-semibold">Current locations</h4>
                {setup[1].length ? (
                  setup[1].map((location) => (
                    <LocationEditor key={location.id} location={location} />
                  ))
                ) : (
                  <p className="muted text-sm">No rooms configured yet.</p>
                )}
              </div>
            </section>

            {/* Create and edit inventory categories. */}
            <section className="card rounded-lg p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Item categories</h3>
              <details className="section-disclosure mt-5">
                <summary className="accent-link cursor-pointer text-sm font-semibold">
                  Add category
                </summary>
                <FeedbackForm
                  action={createCategory}
                  createPreview={{
                    titleField: "name",
                    detailFields: ["assetTagCode", "description"],
                  }}
                  className="mt-5 space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                    <label>
                      <span className="text-sm font-semibold">Category name *</span>
                      <input
                        required
                        name="name"
                        maxLength={255}
                        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                        placeholder="Desktop Computers"
                      />
                    </label>
                    <label>
                      <span className="text-sm font-semibold">Tag code</span>
                      <input
                        name="assetTagCode"
                        maxLength={3}
                        pattern="[A-Za-z0-9]{3}"
                        title="Use three letters or numbers."
                        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                        placeholder="Auto"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-sm font-semibold">Description</span>
                    <input
                      name="description"
                      maxLength={2_000}
                      className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                      placeholder="Optional description"
                    />
                  </label>
                  <SubmitButton
                    pendingLabel="Adding category…"
                    className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                  >
                    Add category
                  </SubmitButton>
                </FeedbackForm>
              </details>
              <div className="divider mt-6 space-y-3 border-t pt-5">
                <h4 className="text-sm font-semibold">Current categories</h4>
                {setup[0].length ? (
                  setup[0].map((category) => (
                    <CategoryEditor key={category.id} category={category} />
                  ))
                ) : (
                  <p className="muted text-sm">No categories configured yet.</p>
                )}
              </div>
            </section>
          </div>
        </>
      </div>
    </div>
  );
}
