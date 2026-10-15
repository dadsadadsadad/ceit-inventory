import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page system-page grid min-h-screen place-items-center">
      <section className="card w-full max-w-lg rounded-lg p-7 text-center">
        <p className="eyebrow">Not found</p>
        <h1 className="title mt-3 text-3xl">Page not found</h1>
        <p className="muted mt-3 text-sm leading-6">
          The link might be wrong or the item was deleted. If you scanned a label, try again or ask
          CEIT staff.
        </p>
        <Link
          href="/dashboard"
          className="primary-button mt-6 inline-block rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
