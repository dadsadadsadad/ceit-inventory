import {
  createCategory,
  createLocation,
  deleteLocation,
  setCategoryActive,
  setLocationActive,
  updateCategory,
  updateLocation,
  updateOwnAccount,
} from "./actions";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { canManageAdministration, requireInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

function CategoryEditor({ category }: { category: { id: string; name: string; description: string | null; isActive: boolean; _count: { items: number } } }) {
  return (
    <details className="card-muted rounded-lg p-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm">
        <span><strong>{category.name}</strong>{category.description ? <span className="muted"> · {category.description}</span> : null}</span>
        <span className="flex items-center gap-3"><span className="muted">{category._count.items} record{category._count.items === 1 ? "" : "s"}</span>{!category.isActive ? <span className="status-pill rounded-md px-2 py-1 text-xs font-semibold">Inactive</span> : null}</span>
      </summary>
      <FeedbackForm action={updateCategory} className="divider mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
        <input type="hidden" name="id" value={category.id} />
        <label><span className="muted text-xs font-bold uppercase tracking-wide">Name</span><input required name="name" defaultValue={category.name} maxLength={255} className="field mt-2 w-full rounded-lg px-3 py-2 text-sm" /></label>
        <label><span className="muted text-xs font-bold uppercase tracking-wide">Description</span><input name="description" defaultValue={category.description ?? ""} maxLength={2_000} className="field mt-2 w-full rounded-lg px-3 py-2 text-sm" /></label>
        <SubmitButton pendingLabel="Saving…" className="secondary-button rounded-lg px-4 py-2 text-sm font-semibold">Save</SubmitButton>
      </FeedbackForm>
      <FeedbackForm action={setCategoryActive} className="mt-3">
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="isActive" value={String(!category.isActive)} />
        <SubmitButton pendingLabel="Updating…" className="accent-link text-xs font-semibold">{category.isActive ? "Deactivate category" : "Reactivate category"}</SubmitButton>
        {category.isActive && category._count.items > 0 ? <span className="muted ml-2 text-xs">Existing records keep this category.</span> : null}
      </FeedbackForm>
    </details>
  );
}

function LocationEditor({ location }: { location: { id: string; name: string; roomNumber: string | null; description: string | null; isActive: boolean; _count: { items: number } } }) {
  const hasAssignedItems = location._count.items > 0;

  return (
    <details className="card-muted rounded-lg p-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm">
        <span><strong>{location.name}</strong>{location.roomNumber ? <span className="muted"> · {location.roomNumber}</span> : null}</span>
        <span className="flex items-center gap-3"><span className="muted">{location._count.items} record{location._count.items === 1 ? "" : "s"}</span>{!location.isActive ? <span className="status-pill rounded-md px-2 py-1 text-xs font-semibold">Inactive</span> : null}</span>
      </summary>
      <FeedbackForm action={updateLocation} className="divider mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={location.id} />
        <label><span className="muted text-xs font-bold uppercase tracking-wide">Location name</span><input required name="name" defaultValue={location.name} maxLength={255} className="field mt-2 w-full rounded-lg px-3 py-2 text-sm" /></label>
        <label><span className="muted text-xs font-bold uppercase tracking-wide">Room number</span><input name="roomNumber" defaultValue={location.roomNumber ?? ""} maxLength={100} className="field mt-2 w-full rounded-lg px-3 py-2 text-sm" /></label>
        <label className="sm:col-span-2"><span className="muted text-xs font-bold uppercase tracking-wide">Description</span><input name="description" defaultValue={location.description ?? ""} maxLength={2_000} className="field mt-2 w-full rounded-lg px-3 py-2 text-sm" /></label>
        <SubmitButton pendingLabel="Saving…" className="secondary-button justify-self-start rounded-lg px-4 py-2 text-sm font-semibold">Save location</SubmitButton>
      </FeedbackForm>
      <FeedbackForm action={setLocationActive} className="mt-3">
        <input type="hidden" name="id" value={location.id} />
        <input type="hidden" name="isActive" value={String(!location.isActive)} />
        <SubmitButton pendingLabel="Updating…" className="accent-link text-xs font-semibold">{location.isActive ? "Deactivate location" : "Reactivate location"}</SubmitButton>
        {location.isActive && location._count.items > 0 ? <span className="muted ml-2 text-xs">Existing records remain assigned here.</span> : null}
      </FeedbackForm>
      <FeedbackForm action={deleteLocation} className="divider mt-4 border-t pt-4">
        <input type="hidden" name="id" value={location.id} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1"><span className="muted text-xs font-bold uppercase tracking-wide">Type DELETE to remove this location</span><input required disabled={hasAssignedItems} name="confirmation" maxLength={16} className="field mt-2 w-full rounded-lg px-3 py-2 text-sm" placeholder="DELETE" aria-label={`Type DELETE to remove ${location.name}`} /></label>
          <SubmitButton disabled={hasAssignedItems} pendingLabel="Deleting…" className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-400 hover:border-red-400 hover:text-red-300">Delete location</SubmitButton>
        </div>
        <p className="muted mt-2 text-xs">{hasAssignedItems ? `This location has ${location._count.items} linked inventory record${location._count.items === 1 ? "" : "s"} and cannot be deleted yet.` : "Deletion is permanent and is only available while no inventory records are assigned here."}</p>
      </FeedbackForm>
    </details>
  );
}

function AccountSettings({ email, username }: { email: string; username: string }) {
  return (
    <section className="card rounded-lg p-5 sm:p-6">
      <div>
        <p className="eyebrow">Your account</p>
        <h2 className="mt-2 text-lg font-semibold">Sign-in details</h2>
        <p className="muted mt-1 max-w-2xl text-sm leading-6">Use either your email address or username to sign in. Confirm your current password before changing account details.</p>
      </div>
      <FeedbackForm action={updateOwnAccount} successMessage="Account updated." className="mt-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="text-sm font-semibold">Email address</span><input required type="email" name="email" defaultValue={email} autoComplete="email" maxLength={254} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
          <label><span className="text-sm font-semibold">Username</span><input required name="username" defaultValue={username} autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]{3,32}" title="Use 3–32 letters, numbers, periods, underscores, or hyphens." className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
        </div>
        <div className="divider grid gap-4 border-t pt-5 md:grid-cols-3">
          <label><span className="text-sm font-semibold">Current password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={256} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Required to save changes" /></label>
          <label><span className="text-sm font-semibold">New password</span><input type="password" name="newPassword" autoComplete="new-password" minLength={8} maxLength={256} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Leave blank to keep" /><span className="muted mt-1 block text-xs">At least 8 characters with a letter and number.</span></label>
          <label><span className="text-sm font-semibold">Confirm new password</span><input type="password" name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={256} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
        </div>
        <p className="muted text-xs leading-5">Changing your password signs you out on every device so you can sign in again with the new password.</p>
        <SubmitButton pendingLabel="Updating account…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Update account</SubmitButton>
      </FeedbackForm>
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireInventoryAccess();
  const canManageSetup = canManageAdministration(user.role);
  const setup = canManageSetup ? await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { items: true } } } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { items: true } } } }),
  ]) : null;

  return (
    <div className="page settings-page">
      <div className="page-inner space-y-6">
        <header>
          <p className="eyebrow">Settings</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Account and inventory settings</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">Keep your sign-in details current. Administrators can also manage the rooms and item groups used throughout the CEIT inventory register.</p>
        </header>

        <AccountSettings email={user.email} username={user.username} />

        {canManageSetup && setup ? (
          <>
            <section>
              <p className="eyebrow">Inventory setup</p>
              <h2 className="mt-2 text-xl font-semibold">Locations and categories</h2>
              <p className="muted mt-1 max-w-2xl text-sm leading-6">Deactivated entries remain on historical records but cannot be selected for new records.</p>
            </section>
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="card rounded-lg p-5 sm:p-6">
                <h3 className="text-lg font-semibold">Rooms and locations</h3>
                <FeedbackForm action={createLocation} className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label><span className="text-sm font-semibold">Location name *</span><input required name="name" maxLength={255} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Computer Laboratory 1" /></label>
                    <label><span className="text-sm font-semibold">Room number</span><input name="roomNumber" maxLength={100} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="CEIT-201" /></label>
                  </div>
                  <label className="block"><span className="text-sm font-semibold">Description</span><input name="description" maxLength={2_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
                  <SubmitButton pendingLabel="Adding location…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Add location</SubmitButton>
                </FeedbackForm>
                <div className="divider mt-6 space-y-3 border-t pt-5"><h4 className="text-sm font-semibold">Current locations</h4>{setup[1].length ? setup[1].map((location) => <LocationEditor key={location.id} location={location} />) : <p className="muted text-sm">No rooms configured yet.</p>}</div>
              </section>

              <section className="card rounded-lg p-5 sm:p-6">
                <h3 className="text-lg font-semibold">Item categories</h3>
                <FeedbackForm action={createCategory} className="mt-5 space-y-4">
                  <label className="block"><span className="text-sm font-semibold">Category name *</span><input required name="name" maxLength={255} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Desktop Computers" /></label>
                  <label className="block"><span className="text-sm font-semibold">Description</span><input name="description" maxLength={2_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Optional description" /></label>
                  <SubmitButton pendingLabel="Adding category…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Add category</SubmitButton>
                </FeedbackForm>
                <div className="divider mt-6 space-y-3 border-t pt-5"><h4 className="text-sm font-semibold">Current categories</h4>{setup[0].length ? setup[0].map((category) => <CategoryEditor key={category.id} category={category} />) : <p className="muted text-sm">No categories configured yet.</p>}</div>
              </section>
            </div>
          </>
        ) : (
          <section className="notice rounded-lg px-5 py-4 text-sm leading-6">
            <h2 className="font-semibold">Inventory setup</h2>
            <p className="mt-1">Only administrators can manage inventory locations and categories. You can update your own account details above.</p>
          </section>
        )}
      </div>
    </div>
  );
}
