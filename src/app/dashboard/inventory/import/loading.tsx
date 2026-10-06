import { PageSkeleton } from "@/app/components/page-skeleton";

// Placeholder while this page loads.
export default function Loading() {
  return <PageSkeleton variant="form" label="Loading import…" />;
}
