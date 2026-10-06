import { PageSkeleton } from "@/app/components/page-skeleton";

// Placeholder while a dashboard page loads.
export default function DashboardLoading() {
  return <PageSkeleton variant="cards" label="Loading inventory data…" />;
}
