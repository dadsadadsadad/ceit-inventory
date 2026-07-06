import Link from "next/link";
import { Boxes } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="login-page grid min-h-screen px-5 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-0">
      {/* Left branding panel on larger screens. */}
      <section className="login-panel hidden px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="brand-mark grid h-11 w-11 place-items-center rounded-lg text-sm font-black">
            <Boxes className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">CEIT Inventory</div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">
              Resource Desk
            </div>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-100">Inventory access</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">
            A clearer way to prepare, track, and review CEIT resources.
          </h1>
          <p className="mt-5 text-sm leading-6 text-white/75">
            Sign in page structure is ready for authentication when the core workflow is added.
          </p>
        </div>
      </section>

      {/* Login form area. */}
      <section className="flex items-center justify-center">
        <div className="card w-full max-w-md rounded-lg p-6 sm:p-8">
          <div className="mb-7">
            <p className="eyebrow">
              Welcome
            </p>
            <h1 className="title mt-3 text-3xl">Sign in</h1>
            <p className="muted mt-2 text-sm leading-6">
              Enter your account details to access the dashboard.
            </p>
          </div>

          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold">
                Email
              </label>
              <input
                type="email"
                id="email"
                className="field mt-2 block w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
                placeholder="name@ceit.edu"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold">
                Password
              </label>
              <input
                type="password"
                id="password"
                className="field mt-2 block w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
                placeholder="Enter password"
              />
            </div>
            <button
              type="submit"
              className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              Sign In
            </button>
          </form>
          <p className="muted mt-5 text-center text-sm">
            Basic page only.{" "}
            <Link href="/dashboard" className="font-semibold text-orange-500 hover:text-orange-300">
              View dashboard
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
