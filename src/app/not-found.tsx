import Link from "next/link";

// Help visitors recover from a missing page, record, or label.
export default function NotFound() {
  return (
    <main className="page system-page grid min-h-screen place-items-center">
      <section className="card w-full max-w-lg rounded-lg p-7 text-center">
        <p className="eyebrow">Not found</p>
        <h1 className="title mt-3 text-3xl">That page or item is not here</h1>
        <p className="muted mt-3 text-sm leading-6">
          The link may be incomplete, or the record may have been removed. If you scanned a label,
          try again with the whole code in view, or ask CEIT staff for help.
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
