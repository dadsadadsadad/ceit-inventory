export const metadata = { title: "Users · CEIT Inventory" };

import { UserRole } from "@prisma/client";

import { createUser, updateUser } from "./actions";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { requireAdministrationPageAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

function roleLabel(role: UserRole) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

// Load staff accounts for the administrator.
export default async function UsersPage() {
  const actor = await requireAdministrationPageAccess();
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: { id: true, email: true, username: true, role: true, isActive: true, updatedAt: true },
  });

  return (
    <div className="page users-page">
      <div className="page-inner space-y-6">
        {/* Account management title. */}
        <header>
          <p className="eyebrow">Administration</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Users</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Add staff accounts, change access, or reset passwords.
          </p>
        </header>

        {/* Create a staff account. */}
        <details className="section-disclosure card rounded-lg p-5 sm:p-6">
          <summary className="cursor-pointer text-lg font-semibold">Add account</summary>
          <FeedbackForm
            action={createUser}
            createPreview={{ titleField: "username", detailFields: ["email", "role"] }}
            className="account-create-grid mt-5 grid gap-4"
          >
            <label>
              <span className="text-sm font-semibold">Email address *</span>
              <input
                required
                type="email"
                name="email"
                autoComplete="email"
                maxLength={254}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                placeholder="staff@school.edu"
              />
            </label>
            <label>
              <span className="text-sm font-semibold">Username *</span>
              <input
                required
                name="username"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9._-]{3,32}"
                title="Use 3–32 letters, numbers, periods, underscores, or hyphens."
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                placeholder="ceit.staff"
              />
            </label>
            <label>
              <span className="text-sm font-semibold">Role *</span>
              <select
                name="role"
                defaultValue={UserRole.STAFF}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {Object.values(UserRole).map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold">Initial password *</span>
              <input
                required
                minLength={8}
                maxLength={256}
                type="password"
                name="password"
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                autoComplete="new-password"
              />
              <span className="muted mt-1 block text-xs">
                At least 8 characters with a letter and number.
              </span>
            </label>
            <SubmitButton
              pendingLabel="Creating…"
              className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Create account
            </SubmitButton>
          </FeedbackForm>
        </details>

        {/* Existing staff accounts. */}
        <section className="card overflow-hidden rounded-lg">
          <div className="divider flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Existing accounts</h2>
            <p className="muted text-sm">
              Password resets and deactivations sign the user out on all devices.
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {users.map((user) => (
              <details key={user.id} className="section-disclosure px-5 py-4">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 text-sm">
                  <span>
                    <strong>
                      {user.username}
                      {user.id === actor.id ? " (you)" : ""}
                    </strong>
                    <span className="muted mt-1 block break-all">{user.email}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="muted">{roleLabel(user.role)}</span>
                    <span className="status-pill rounded-md px-2 py-1 text-xs font-semibold">
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                    <span className="accent-link font-semibold">Edit account</span>
                  </span>
                </summary>
                <FeedbackForm
                  action={updateUser}
                  resetOnSuccess={false}
                  revision={user.updatedAt.toISOString()}
                  savedValues={{ role: user.role }}
                  className="account-editor-grid divider mt-4 gap-4 border-t pt-5"
                >
                  {/* Update an account or reset its password. */}
                  <input type="hidden" name="id" value={user.id} />
                  <label>
                    <span className="muted text-xs font-bold uppercase tracking-wide">
                      Email address
                    </span>
                    <input
                      required
                      type="email"
                      name="email"
                      defaultValue={user.email}
                      autoComplete="email"
                      maxLength={254}
                      className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label>
                    <span className="muted text-xs font-bold uppercase tracking-wide">
                      Username
                    </span>
                    <input
                      required
                      name="username"
                      defaultValue={user.username}
                      autoComplete="username"
                      minLength={3}
                      maxLength={32}
                      pattern="[A-Za-z0-9._-]{3,32}"
                      title="Use 3–32 letters, numbers, periods, underscores, or hyphens."
                      className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label>
                    <span className="muted text-xs font-bold uppercase tracking-wide">Role</span>
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                    >
                      {Object.values(UserRole).map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex h-10 items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={user.isActive}
                      className="h-4 w-4"
                    />{" "}
                    Active
                  </label>
                  <label>
                    <span className="muted text-xs font-bold uppercase tracking-wide">
                      New password
                    </span>
                    <input
                      minLength={8}
                      maxLength={256}
                      type="password"
                      name="password"
                      className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                      autoComplete="new-password"
                      placeholder="Leave blank to keep"
                    />
                  </label>
                  <SubmitButton
                    pendingLabel="Saving…"
                    className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                  >
                    Save account
                  </SubmitButton>
                </FeedbackForm>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
