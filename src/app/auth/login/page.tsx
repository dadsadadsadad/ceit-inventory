import type { Metadata } from "next";

import { SubmitButton } from "@/app/components/submit-button";
import { BrandMark } from "@/app/components/brand-mark";

import { signIn } from "../actions";

export const metadata: Metadata = { title: "Sign in · CEIT Inventory" };

const messages: Record<string, string> = {
  "invalid-credentials": "The email address, username, or password is incorrect.",
  "missing-credentials": "Enter your email address or username and password.",
  "temporarily-locked":
    "For security, this account is temporarily locked. Try again in about 15 minutes or ask an administrator for help.",
};

const notices: Record<string, string> = {
  "password-updated": "Your password was updated. Sign in again with your new password.",
};

// Sign-in form and account notices.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  return (
    <main className="login-page grid min-h-screen px-5 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-0">
      {/* Desktop branding panel. */}
      <section className="login-panel hidden px-10 py-12 lg:flex lg:flex-col lg:justify-between">
        <div className="brand-lockup flex items-center gap-3">
          <BrandMark />
          <div>
            <strong className="text-base">
              CEIT
              <span className="brand-wordmark-dot" aria-hidden="true">
                .
              </span>
            </strong>
            <span className="brand-caption text-xs">Inventory workspace</span>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="eyebrow">A place for everything.</p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight">
            Good work starts with the right equipment.
          </h2>
          <p className="login-caption">Keep it organized. Put it to work. Pass it on.</p>
        </div>
      </section>

      {/* Mobile branding and sign-in form. */}
      <section className="login-form-side flex flex-col items-center justify-center gap-5">
        <div className="login-mobile-brand brand-lockup flex items-center gap-3 lg:hidden">
          <BrandMark />
          <div>
            <strong>
              CEIT
              <span className="brand-wordmark-dot" aria-hidden="true">
                .
              </span>
            </strong>
            <span className="brand-caption">Inventory workspace</span>
          </div>
        </div>
        <div className="card w-full max-w-md rounded-lg p-6 sm:p-8">
          <div className="mb-7">
            <p className="eyebrow">Staff access</p>
            <h1 className="title mt-3 text-3xl">Sign in</h1>
            <p className="muted mt-2 text-sm leading-6">
              Manage equipment, borrowing, and maintenance in one place.
            </p>
          </div>
          {error && messages[error] ? (
            <div className="notice mb-5 rounded-lg px-4 py-3 text-sm" role="alert">
              {messages[error]}
            </div>
          ) : null}
          {notice && notices[notice] ? (
            <div className="notice notice-success mb-5 rounded-lg px-4 py-3 text-sm" role="status">
              {notices[notice]}
            </div>
          ) : null}
          {/* Account credentials and sign-in button. */}
          <form action={signIn} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-semibold">
                Email address or username
              </label>
              <input
                required
                type="text"
                id="identifier"
                name="identifier"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                className="field mt-2 block w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
                placeholder="name@example.com or ceit.staff"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold">
                Password
              </label>
              <input
                required
                type="password"
                id="password"
                name="password"
                autoComplete="current-password"
                maxLength={256}
                className="field mt-2 block w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
                placeholder="Enter password"
              />
            </div>
            <SubmitButton
              pendingLabel="Signing in…"
              className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              Sign in
            </SubmitButton>
          </form>
        </div>
      </section>
    </main>
  );
}
