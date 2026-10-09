import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { updateOwnAccount } from "../actions";
import { PasswordInput } from "@/app/components/password-input";

// Change the signed-in account's details and password.
export function AccountSettings({ email, username }: { email: string; username: string }) {
  return (
    <section className="card rounded-lg p-5 sm:p-6">
      {/* Signed-in account settings. */}
      <div>
        <p className="eyebrow">Your account</p>
        <h2 className="mt-2 text-lg font-semibold">Sign-in details</h2>
        <p className="muted mt-1 max-w-2xl text-sm leading-6">
          Use either your email address or username to sign in. Confirm your current password before
          changing account details.
        </p>
      </div>
      <FeedbackForm
        action={updateOwnAccount}
        revision={`${email}:${username}`}
        resetOnSuccess={false}
        successMessage="Account updated."
        className="mt-5 space-y-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Email address</span>
            <input
              required
              type="email"
              name="email"
              defaultValue={email}
              autoComplete="email"
              maxLength={254}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Username</span>
            <input
              required
              name="username"
              defaultValue={username}
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern={"[A-Za-z0-9._\\-]{3,32}"}
              title="Use 3–32 letters, numbers, periods, underscores, or hyphens."
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
        </div>
        <div className="divider grid gap-4 border-t pt-5 md:grid-cols-3">
          <PasswordInput
            label="Current password"
            required
            name="currentPassword"
            autoComplete="current-password"
            maxLength={256}
            className="field w-full rounded-lg px-3 py-2.5 text-sm"
            placeholder="Required to save changes"
          />
          <PasswordInput
            label="New password"
            hint="At least 8 characters with a letter and number."
            name="newPassword"
            autoComplete="new-password"
            minLength={8}
            maxLength={256}
            className="field w-full rounded-lg px-3 py-2.5 text-sm"
            placeholder="Leave blank to keep"
          />
          <PasswordInput
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={8}
            maxLength={256}
            className="field w-full rounded-lg px-3 py-2.5 text-sm"
          />
        </div>
        <p className="muted text-xs leading-5">
          Changing your password signs you out on every device so you can sign in again with the new
          password.
        </p>
        <SubmitButton
          pendingLabel="Updating account…"
          className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Update account
        </SubmitButton>
      </FeedbackForm>
    </section>
  );
}
