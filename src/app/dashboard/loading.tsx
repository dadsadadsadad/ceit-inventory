export default function DashboardLoading() {
  return (
    <div className="page loading-page" aria-busy="true" aria-live="polite">
      <div className="page-inner space-y-6">
        <div className="skeleton h-10 w-48 rounded-lg" />
        <div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32 rounded-lg" /><div className="skeleton h-32 rounded-lg" /><div className="skeleton h-32 rounded-lg" /></div>
        <div className="skeleton h-72 rounded-lg" />
        <span className="sr-only">Loading inventory data…</span>
      </div>
    </div>
  );
}
