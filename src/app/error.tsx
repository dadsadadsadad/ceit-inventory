"use client";

import { useEffect } from "react";

export default function ApplicationError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("CEIT Inventory route error", error);
  }, [error]);

  return (
    <main className="page grid min-h-screen place-items-center">
      <section className="card w-full max-w-lg rounded-lg p-7 text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="title mt-3 text-3xl">This screen could not be loaded</h1>
        <p className="muted mt-3 text-sm leading-6">Your data was not changed. Try loading the screen again, or return to the dashboard if the problem continues.</p>
        <div className="mt-6 flex justify-center gap-3"><button onClick={retry} className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Try again</button><a href="/dashboard" className="card rounded-lg px-4 py-2.5 text-sm font-semibold hover:text-orange-400">Dashboard</a></div>
      </section>
    </main>
  );
}
