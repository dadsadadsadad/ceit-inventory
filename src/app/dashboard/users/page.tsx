import { UserRole } from "@prisma/client";

import { createUser, updateUser } from "./actions";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { requireAdministrator } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

function roleLabel(role: UserRole) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default async function UsersPage() {
  await requireAdministrator();
  const users = await prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { email: "asc" }] });

  return (
    <div className="page users-page">
      <div className="page-inner space-y-6">
        <header>
          <p className="eyebrow">Users</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Account directory</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">Create CEIT inventory accounts, assign roles, reset a password, or deactivate access without losing the audit trail.</p>
        </header>

        <section className="card rounded-lg p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Add account</h2>
          <FeedbackForm action={createUser} className="mt-5 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
            <label><span className="text-sm font-semibold">Email *</span><input required type="email" name="email" autoComplete="email" maxLength={254} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="staff@school.edu" /></label>
            <label><span className="text-sm font-semibold">Role *</span><select name="role" defaultValue={UserRole.VIEWER} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">{Object.values(UserRole).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
            <label><span className="text-sm font-semibold">Initial password *</span><input required minLength={8} maxLength={256} type="password" name="password" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" autoComplete="new-password" /><span className="muted mt-1 block text-xs">At least 8 characters with a letter and number.</span></label>
            <SubmitButton pendingLabel="Creating…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Create account</SubmitButton>
          </FeedbackForm>
        </section>

        <section className="card overflow-hidden rounded-lg">
          <div className="divider flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4"><h2 className="text-lg font-semibold">Existing accounts</h2><p className="muted text-sm">Password resets and deactivations sign the user out on all devices.</p></div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {users.map((user) => (
              <FeedbackForm key={user.id} action={updateUser} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(14rem,1.5fr)_11rem_9rem_minmax(12rem,1fr)_auto] lg:items-end">
                <input type="hidden" name="id" value={user.id} />
                <label><span className="muted text-xs font-bold uppercase tracking-wide">Email</span><input required type="email" name="email" defaultValue={user.email} autoComplete="email" maxLength={254} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
                <label><span className="muted text-xs font-bold uppercase tracking-wide">Role</span><select name="role" defaultValue={user.role} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">{Object.values(UserRole).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
                <label className="flex h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="isActive" defaultChecked={user.isActive} className="h-4 w-4" /> Active</label>
                <label><span className="muted text-xs font-bold uppercase tracking-wide">New password</span><input minLength={8} maxLength={256} type="password" name="password" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" autoComplete="new-password" placeholder="Leave blank to keep" /></label>
                <SubmitButton pendingLabel="Saving…" className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Save</SubmitButton>
              </FeedbackForm>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
