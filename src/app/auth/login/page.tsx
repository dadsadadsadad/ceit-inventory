import { Boxes } from "lucide-react";

import { SubmitButton } from "@/app/components/submit-button";

import { signIn } from "../actions";

const messages: Record<string, string> = {
  "invalid-credentials": "The email address or password is incorrect.",
  "missing-credentials": "Enter both your email address and password.",
  "temporarily-locked": "For security, this account is temporarily locked. Try again in about 15 minutes or ask an administrator for help.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="login-page grid min-h-screen px-5 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-0">
      <section className="login-panel hidden px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="brand-mark grid h-11 w-11 place-items-center rounded-lg text-sm font-black"><Boxes className="h-6 w-6" aria-hidden="true" /></div>
          <div><div className="text-base font-semibold tracking-tight">CEIT Inventory</div><div className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">Inventory management</div></div>
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/80">Authorized access</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">Track CEIT resources with the right information in the right hands.</h1>
          <p className="mt-5 text-sm leading-6 text-white/75">Use your authorized inventory account to manage rooms, assets, and QR scans.</p>
        </div>
      </section>

      <section className="flex flex-col items-center justify-center gap-5">
        <div className="login-mobile-brand flex items-center gap-3 lg:hidden">
          <div className="brand-mark grid h-10 w-10 place-items-center rounded-lg"><Boxes className="h-5 w-5" aria-hidden="true" /></div>
          <div><div className="text-sm font-semibold tracking-tight">CEIT Inventory</div><div className="login-mobile-subtitle text-[0.65rem] font-medium uppercase tracking-[0.18em]">Inventory management</div></div>
        </div>
        <div className="card w-full max-w-md rounded-lg p-6 sm:p-8">
          <div className="mb-7">
            <p className="eyebrow">Welcome</p>
            <h1 className="title mt-3 text-3xl">Sign in</h1>
            <p className="muted mt-2 text-sm leading-6">Enter your authorized CEIT inventory account details.</p>
          </div>
          {error && messages[error] ? <div className="notice mb-5 rounded-lg px-4 py-3 text-sm" role="alert">{messages[error]}</div> : null}
          <form action={signIn} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold">Email</label>
              <input required type="email" id="email" name="email" autoComplete="email" maxLength={254} className="field mt-2 block w-full rounded-lg px-3 py-2.5 text-sm outline-none transition" placeholder="name@example.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold">Password</label>
              <input required type="password" id="password" name="password" autoComplete="current-password" maxLength={256} className="field mt-2 block w-full rounded-lg px-3 py-2.5 text-sm outline-none transition" placeholder="Enter password" />
            </div>
            <SubmitButton pendingLabel="Signing in…" className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors">Sign in</SubmitButton>
          </form>
        </div>
      </section>
    </main>
  );
}
