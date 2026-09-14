import "server-only";
import { revalidatePath } from "next/cache";

// Refresh pages affected by inventory, loans, or repairs.
export function refreshInventoryViews(itemId?: string) {
  for (const path of [
    "/dashboard",
    "/dashboard/inventory",
    "/dashboard/borrowing",
    "/dashboard/maintenance",
    "/dashboard/reports",
    "/dashboard/activity",
  ]) {
    revalidatePath(path);
  }
  revalidatePath("/scan/[qrCode]", "page");
  if (itemId) {
    revalidatePath(`/dashboard/inventory/${itemId}`);
  }
}
