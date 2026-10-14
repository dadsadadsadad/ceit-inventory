import type { Prisma } from "@prisma/client";

import { manilaCalendarDate } from "./manila-date";

export const warrantyWarningDays = 60;

export type WarrantyState = "expired" | "ending" | "active" | "none";

const dayMs = 24 * 60 * 60 * 1000;

// end dates are stored as utc midnight, compare with today in manila so the last day still counts
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

export function warrantyEndingWithinWhere(
  days: number,
  now = new Date(),
): Prisma.InventoryItemWhereInput {
  const start = new Date(today(now));
  return { warrantyEndsAt: { gte: start, lte: new Date(start.getTime() + days * dayMs) } };
}

// negative once ended
export function warrantyDaysLeft(endsAt: Date, now = new Date()) {
  return Math.round((endsAt.getTime() - today(now)) / dayMs);
}
