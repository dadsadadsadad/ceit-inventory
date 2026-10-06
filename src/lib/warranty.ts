import type { Prisma } from "@prisma/client";

import { manilaCalendarDate } from "./manila-date";

/** How soon before a warranty ends it counts as "ending soon". */
export const warrantyWarningDays = 60;

export type WarrantyState = "expired" | "ending" | "active" | "none";

const dayMs = 24 * 60 * 60 * 1000;

// Warranty end dates are calendar days, saved as midnight UTC of that day. Compare them with
// today's calendar day in Philippine time, so a warranty runs through the whole of its last day.
function today(now: Date) {
  return Date.parse(`${manilaCalendarDate(now)}T00:00:00.000Z`);
}

export function warrantyState(endsAt: Date | null | undefined, now = new Date()): WarrantyState {
  if (!endsAt) {
    return "none";
  }
  const remaining = endsAt.getTime() - today(now);
  if (remaining < 0) {
    return "expired";
  }
  return remaining <= warrantyWarningDays * dayMs ? "ending" : "active";
}

export function warrantyStateLabel(state: WarrantyState) {
  return {
    expired: "Warranty ended",
    ending: `Ends within ${warrantyWarningDays} days`,
    active: "Under warranty",
    none: "No warranty recorded",
  }[state];
}

export const warrantyFilters = ["expired", "ending", "active", "none"] as const;
export type WarrantyFilter = (typeof warrantyFilters)[number];

export function isWarrantyFilter(value: string | null | undefined): value is WarrantyFilter {
  return warrantyFilters.includes(value as WarrantyFilter);
}

/** The records in one warranty state, using the same day arithmetic as `warrantyState`. */
export function warrantyWhere(
  filter: WarrantyFilter,
  now = new Date(),
): Prisma.InventoryItemWhereInput {
  const start = new Date(today(now));
  const soonEnd = new Date(start.getTime() + warrantyWarningDays * dayMs);
  switch (filter) {
    case "expired":
      return { warrantyEndsAt: { lt: start } };
    case "ending":
      return { warrantyEndsAt: { gte: start, lte: soonEnd } };
    case "active":
      return { warrantyEndsAt: { gt: soonEnd } };
    case "none":
      return { warrantyEndsAt: null };
  }
}
