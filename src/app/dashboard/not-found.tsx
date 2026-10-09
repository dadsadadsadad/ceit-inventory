import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/app/components/empty-state";

// A missing record inside the workspace keeps the navigation, so staff can carry on.
export default function DashboardNotFound() {
  return (
    <div className="page">
      <div className="page-inner space-y-6">
        <header>
          <p className="eyebrow">Not found</p>
          <h1 className="title mt-3 text-3xl">That inventory record is not available</h1>
        </header>
        <EmptyState
          icon={SearchX}
          title="It may have been removed, or the link is incomplete."
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
          Records that were retired are still listed in the inventory with the Retired status.
        </EmptyState>
      </div>
    </div>
  );
}
