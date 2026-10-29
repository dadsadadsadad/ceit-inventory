"use client";

import { useEffect } from "react";

export default function ApplicationError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("CEIT Inventory route error", error);
  }, [error]);

  return (
    <main className="page system-page grid min-h-screen place-items-center">
      <section className="card w-full max-w-lg rounded-lg p-7 text-center">
        <h1 className="title text-3xl">Something went wrong</h1>
        <p className="muted mt-3 text-sm leading-6">
          Reload the page. If it keeps happening, go back to the dashboard and check if your change
          was saved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={retry}
            className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
