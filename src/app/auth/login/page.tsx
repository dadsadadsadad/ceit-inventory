import type { Metadata } from "next";

import { ClipboardList, QrCode, Wrench } from "lucide-react";

import { BrandMark } from "@/app/components/brand-mark";
import { PasswordInput } from "@/app/components/password-input";
import { SubmitButton } from "@/app/components/submit-button";

import { signIn } from "../actions";

export const metadata: Metadata = { title: "Sign in · CEIT Inventory" };

const messages: Record<string, string> = {
  "invalid-credentials":
    "Wrong username or password, or the account is locked. Try again in 15 minutes or ask an admin.",
  "missing-credentials": "Enter your username and password.",
  "too-many-attempts": "Too many failed attempts. Try again in 15 minutes.",
};

const notices: Record<string, string> = {
  "password-updated": "Password changed. Sign in with your new password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  return (
    <main className="login-page grid min-h-screen px-5 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-0">
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
          <h2 className="text-4xl font-bold tracking-tight">CEIT equipment inventory</h2>
          <p className="login-caption">Track equipment, borrowing and repairs.</p>
          <ul className="login-points">
            <li>
              <QrCode size={18} aria-hidden="true" /> Scan a label to open an item
            </li>
            <li>
              <ClipboardList size={18} aria-hidden="true" /> Lend and reserve equipment
            </li>
            <li>
              <Wrench size={18} aria-hidden="true" /> Track repairs
            </li>
          </ul>
        </div>
      </section>

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
            <h1 className="title text-3xl">Sign in</h1>
            <p className="muted mt-2 text-sm leading-6">Sign in to continue.</p>
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
            <PasswordInput
              label="Password"
              required
              id="password"
              name="password"
              autoComplete="current-password"
              maxLength={256}
              className="field block w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
              placeholder="Enter password"
            />
            <SubmitButton
              pendingLabel="Signing in..."
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
