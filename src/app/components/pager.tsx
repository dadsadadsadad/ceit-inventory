import Link from "next/link";

import { paginationEntries } from "@/lib/pagination";

/** Previous / numbered / next navigation shared by every long list. */
export function Pager({
  currentPage,
  hrefForPage,
  label,
  totalPages,
}: {
  currentPage: number;
  hrefForPage: (page: number) => string;
  /** Plain name of what is paged, for example "Inventory". */
  label: string;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <nav
      className="divider flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3"
      aria-label={`${label} pages`}
    >
      {currentPage > 1 ? (
        <Link
          href={hrefForPage(currentPage - 1)}
          className="pagination-link px-3 text-sm font-semibold"
        >
          ← Previous
        </Link>
      ) : (
        <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">
          ← Previous
        </span>
      )}
      <div
        className="order-3 flex w-full items-center justify-center gap-1 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:pb-0"
        aria-label={`Choose ${label.toLowerCase()} page`}
      >
        {paginationEntries(totalPages, currentPage).map((entry, index) =>
          entry === null ? (
            <span key={`gap-${index}`} className="muted px-1 text-sm" aria-hidden="true">
              …
            </span>
          ) : entry === currentPage ? (
            <span
              key={entry}
              className="pagination-current text-sm font-semibold"
              aria-current="page"
            >
              {entry}
            </span>
          ) : (
            <Link
              key={entry}
              href={hrefForPage(entry)}
              className="pagination-link text-sm font-semibold"
              aria-label={`Go to page ${entry}`}
            >
              {entry}
            </Link>
          ),
        )}
      </div>
      {currentPage < totalPages ? (
        <Link
          href={hrefForPage(currentPage + 1)}
          className="pagination-link px-3 text-sm font-semibold"
        >
          Next →
        </Link>
      ) : (
        <span className="card-muted rounded-lg px-3 py-2 text-sm font-semibold opacity-50">
          Next →
        </span>
      )}
    </nav>
  );
}
