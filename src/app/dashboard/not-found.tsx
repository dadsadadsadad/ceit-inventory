import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/app/components/empty-state";

// keeps the sidebar so staff aren't stuck
export default function DashboardNotFound() {
  return (
    <div className="page">
      <div className="page-inner space-y-6">
        <header>
          <p className="eyebrow">Not found</p>
          <h1 className="title mt-3 text-3xl">Item not found</h1>
        </header>
        <EmptyState
          icon={SearchX}
          title="It may have been deleted, or the link is wrong."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/dashboard/inventory"
                className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
              >
                Search the inventory
              </Link>
              <Link
                href="/dashboard"
                className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
              >
                Go to dashboard
              </Link>
            </div>
          }
        >
          Retired items are still in the list with the Retired status.
        </EmptyState>
      </div>
    </div>
  );
}
