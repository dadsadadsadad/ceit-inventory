export const metadata = { title: "Rooms and categories · CEIT Inventory" };

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

import { createCategory, createLocation } from "./actions";
import { CategoryEditor } from "./_components/category-editor";
import { CustomFieldEditor, NewCustomField } from "./_components/custom-field-editor";
import { LocationEditor } from "./_components/location-editor";
import { TagCodeInput } from "./_components/tag-code-input";

export const dynamic = "force-dynamic";

export default async function InventorySetupPage() {
  await requireInventoryAccess();
  const setup = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.location.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.customField.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  const codes = (records: { assetTagCode: string | null }[]) =>
    records.flatMap((record) => (record.assetTagCode ? [record.assetTagCode] : []));
  const categoryCodes = codes(setup[0]);
  const roomCodes = codes(setup[1]);
  // a real code from the other list makes the example tag believable
  const sampleCategory = categoryCodes[0] ?? "CAT";
  const sampleRoom = roomCodes[0] ?? "ROOM";

  return (
    <div className="page settings-page">
      <div className="page-inner space-y-6">
        <header>
          <h1 className="title text-3xl sm:text-4xl">Rooms and categories</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Rooms, item categories and extra fields used across the inventory.
          </p>
        </header>

        <>
          <section>
            <p className="muted max-w-2xl text-sm leading-6">
              Inactive rooms and categories stay on old items. Codes are used in{" "}
              <code>CATEGORY-ROOM-0001</code> asset tags, e.g. <code>ROBOT-LAB1-0001</code>.
            </p>
          </section>
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card rounded-lg p-5 sm:p-6">
              <h3 className="card-title text-lg font-semibold">Rooms</h3>
              <details className="section-disclosure mt-5">
                <summary className="accent-link cursor-pointer text-sm font-semibold">
                  Add room
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
                      <span className="text-sm font-semibold">Room name *</span>
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
                    <TagCodeInput kind="room" usedCodes={roomCodes} otherCode={sampleCategory} />
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
                    pendingLabel="Adding room..."
                    className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                  >
                    Add room
                  </SubmitButton>
                </FeedbackForm>
              </details>
              <div className="divider mt-6 space-y-3 border-t pt-5">
                <h4 className="text-sm font-semibold">Current rooms</h4>
                {setup[1].length ? (
                  setup[1].map((location) => (
                    <LocationEditor
                      key={location.id}
                      location={location}
                      usedCodes={roomCodes}
                      otherCode={sampleCategory}
                    />
                  ))
                ) : (
                  <p className="muted text-sm">No rooms configured yet.</p>
                )}
              </div>
            </section>

            <section className="card rounded-lg p-5 sm:p-6">
              <h3 className="card-title text-lg font-semibold">Item categories</h3>
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
                  <div className="grid gap-4 sm:grid-cols-2">
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
                    <TagCodeInput
                      kind="category"
                      usedCodes={categoryCodes}
                      otherCode={sampleRoom}
                    />
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
                    pendingLabel="Adding category..."
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
                    <CategoryEditor
                      key={category.id}
                      category={category}
                      usedCodes={categoryCodes}
                      otherCode={sampleRoom}
                    />
                  ))
                ) : (
                  <p className="muted text-sm">No categories configured yet.</p>
                )}
              </div>
            </section>
          </div>

          <section>
            <h2 className="text-xl font-semibold">Extra fields</h2>
            <p className="muted mt-1 max-w-2xl text-sm leading-6">
              Extra details you want to track on items, like a funding source.
            </p>
          </section>
          <section className="card rounded-lg p-5 sm:p-6">
            <NewCustomField categories={setup[0].map(({ id, name }) => ({ id, name }))} />
            <div className="divider mt-6 space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Current extra fields</h3>
              {setup[2].length ? (
                setup[2].map((field) => (
                  <CustomFieldEditor
                    key={field.id}
                    field={field}
                    categories={setup[0].map(({ id, name }) => ({ id, name }))}
                  />
                ))
              ) : (
                <p className="muted text-sm">No extra fields yet.</p>
              )}
            </div>
          </section>
        </>
      </div>
    </div>
  );
}
