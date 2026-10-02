export default function ScanLoading() {
  return (
    <main className="page scan-page" aria-busy="true">
      <div className="page-narrow space-y-6">
        <p className="eyebrow">CEIT Inventory</p>
        <p className="title text-3xl" role="status">
          Loading equipment…
        </p>
        <div className="card rounded-lg p-5 sm:p-7" aria-hidden="true">
          <div className="h-4 w-2/3 rounded bg-[var(--surface-muted)]" />
          <div className="mt-5 h-4 w-1/2 rounded bg-[var(--surface-muted)]" />
          <div className="mt-5 h-4 w-1/3 rounded bg-[var(--surface-muted)]" />
        </div>
      </div>
    </main>
  );
}
