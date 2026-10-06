/**
 * The shape of a page while its data loads, so the layout does not jump when the real page
 * arrives. Each variant matches a family of pages: a record list, a dashboard of panels, or a form.
 */
export function PageSkeleton({
  variant,
  label = "Loading…",
}: {
  variant: "cards" | "detail" | "form" | "list";
  label?: string;
}) {
  return (
    <div className="page loading-page" aria-busy="true">
      <div className="page-inner space-y-6">
        <div className="space-y-3">
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-10 w-64 max-w-full" />
        </div>
        {variant === "list" ? (
          <>
            <div className="skeleton h-20 rounded-lg" />
            <div className="card space-y-3 rounded-lg p-4">
              {Array.from({ length: 8 }, (_, row) => (
                <div key={row} className="skeleton h-12" />
              ))}
            </div>
          </>
        ) : variant === "cards" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, card) => (
                <div key={card} className="skeleton h-28 rounded-lg" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="skeleton h-64 rounded-lg" />
              <div className="skeleton h-64 rounded-lg" />
            </div>
          </>
        ) : variant === "detail" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-6">
              <div className="skeleton h-56 rounded-lg" />
              <div className="skeleton h-40 rounded-lg" />
            </div>
            <div className="skeleton h-72 rounded-lg" />
          </div>
        ) : (
          <div className="card space-y-5 rounded-lg p-6">
            {Array.from({ length: 5 }, (_, field) => (
              <div key={field} className="space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-11 w-full" />
              </div>
            ))}
          </div>
        )}
        <span className="sr-only" role="status">
          {label}
        </span>
      </div>
    </div>
  );
}
