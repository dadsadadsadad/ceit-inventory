export const metadata = { title: "Users · CEIT Inventory" };

import { UserRole, type Prisma } from "@prisma/client";

import { createUser, unlockUser, updateUser } from "./actions";
import { FeedbackForm } from "@/app/components/feedback-form";
import { ClearFiltersButton, FilterForm } from "@/app/components/filter-form";
import { SubmitButton } from "@/app/components/submit-button";
import { requireUserManagementPageAccess } from "@/lib/inventory-auth";
import { formatManilaDate } from "@/lib/manila-date";
import { accountRoles, roleLabel } from "@/lib/roles";
import { everyTermMatches, searchTerms } from "@/lib/search-terms";
import { firstParam, textParam, type RawParam } from "@/lib/search-params";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

type SearchParams = { q?: RawParam; role?: RawParam; status?: RawParam };

const statusFilters = ["active", "inactive", "locked"] as const;

// Load staff accounts for the administrator.
export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireUserManagementPageAccess();
  const search = await searchParams;
  const now = new Date();
  const query = textParam(search.q);
  const requestedRole = firstParam(search.role);
  const role = Object.values(UserRole).includes(requestedRole as UserRole)
    ? (requestedRole as UserRole)
    : undefined;
  const requestedStatus = firstParam(search.status);
  const status = statusFilters.find((value) => value === requestedStatus);
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
    ...(status === "locked" ? { lockedUntil: { gt: now } } : {}),
    ...(searchTerms(query).length
      ? {
          AND: everyTermMatches<Prisma.UserWhereInput>(searchTerms(query), (term) => [
            { email: { contains: term, mode: "insensitive" } },
            { username: { contains: term, mode: "insensitive" } },
          ]),
        }
      : {}),
  };
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
      lockedUntil: true,
      updatedAt: true,
    },
  });

  return (
    <div className="page users-page">
      <div className="page-inner space-y-6">
        {/* Account management title. */}
        <header>
          <p className="eyebrow">Administration</p>
          <h1 className="title mt-3 text-3xl sm:text-4xl">Users</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-6">
            Add accounts, change access, or reset passwords. Only administrators can do this.
          </p>
        </header>

        {/* The two account types. */}
        <section className="grid gap-4 sm:grid-cols-2" aria-label="Account types">
          {accountRoles.map((role) => (
            <article key={role.value} className="card rounded-lg p-5">
              <p className="eyebrow">{role.label}</p>
              <p className="muted mt-2 text-sm leading-6">{role.description}</p>
            </article>
          ))}
        </section>

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
                pattern={"[A-Za-z0-9._\\-]{3,32}"}
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
                {accountRoles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
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

        {/* Find accounts by name, account type, or status. Choices apply at once. */}
        <FilterForm
          className="card grid gap-3 rounded-lg p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] xl:items-end"
          label="Account filters"
        >
          <label className="sm:col-span-2 xl:col-span-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">Search</span>
            <input
              name="q"
              defaultValue={query}
              maxLength={120}
              placeholder="Username or email"
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Account type</span>
            <select
              name="role"
              defaultValue={role ?? ""}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">All account types</option>
              {accountRoles.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Status</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked after failed sign-ins</option>
            </select>
          </label>
          <ClearFiltersButton className="accent-link text-sm font-semibold">
            Clear all filters
          </ClearFiltersButton>
        </FilterForm>

        {/* Existing staff accounts. */}
        <section className="card overflow-hidden rounded-lg">
          <div className="divider flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
            <h2 className="text-lg font-semibold">Existing accounts</h2>
            <p className="muted text-sm">
              Password resets and deactivations sign the user out on all devices.
            </p>
          </div>
          {users.length === 0 ? (
            <p className="muted px-5 py-6 text-sm">No accounts match these filters.</p>
          ) : null}
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
                    {user.lockedUntil && user.lockedUntil > now ? (
                      <span className="status-pill status-pill-critical rounded-md px-2 py-1 text-xs font-semibold">
                        Locked
                      </span>
                    ) : null}
                    <span
                      className={`status-pill ${user.isActive ? "status-pill-positive" : "status-pill-retired"} rounded-md px-2 py-1 text-xs font-semibold`}
                    >
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
                      pattern={"[A-Za-z0-9._\\-]{3,32}"}
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
                      {accountRoles.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
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
                {user.lockedUntil && user.lockedUntil > now ? (
                  <FeedbackForm
                    action={unlockUser}
                    successMessage="Sign-in lock cleared."
                    className="divider mt-4 flex flex-wrap items-center gap-3 border-t pt-4"
                  >
                    <input type="hidden" name="id" value={user.id} />
                    <p className="muted text-sm">
                      Too many failed sign-ins locked this account until{" "}
                      {formatManilaDate(user.lockedUntil, { hour: "numeric", minute: "2-digit" })}.
                    </p>
                    <SubmitButton
                      pendingLabel="Unlocking…"
                      className="secondary-button rounded-lg px-4 py-2 text-sm font-semibold"
                    >
                      Unlock account
                    </SubmitButton>
                  </FeedbackForm>
                ) : null}
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
