import "server-only";

import { ItemStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/prisma";

import { addDays, dueSoonDays } from "./maintenance-plans";
import { manilaCalendarDate } from "./manila-date";

const inService = { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } };

// the items a schedule covers, retired and lost ones are skipped
export function planItemsWhere(plan: {
  categoryId: string | null;
  itemId: string | null;
  locationId: string | null;
}): Prisma.InventoryItemWhereInput {
  if (plan.itemId) {
    return { id: plan.itemId, ...inService };
  }
  return {
    ...inService,
    ...(plan.categoryId ? { categoryId: plan.categoryId } : {}),
    ...(plan.locationId ? { locationId: plan.locationId } : {}),
  };
}

export function dayValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayDate(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

const planInclude = {
  category: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  item: { select: { id: true, name: true, assetTag: true, location: { select: { name: true } } } },
} satisfies Prisma.MaintenancePlanInclude;

export async function loadMaintenancePlans() {
  const plans = await prisma.maintenancePlan.findMany({
    include: {
      ...planInclude,
      logs: { orderBy: { doneAt: "desc" }, take: 5 },
    },
    orderBy: [{ isActive: "desc" }, { nextDueOn: "asc" }, { title: "asc" }],
    take: 200,
  });
  const counts = await Promise.all(
    plans.map((plan) => prisma.inventoryItem.count({ where: planItemsWhere(plan) })),
  );
  return plans.map((plan, index) => ({
    ...plan,
    itemCount: counts[index],
    nextDue: dayValue(plan.nextDueOn),
  }));
}

export type MaintenancePlanRow = Awaited<ReturnType<typeof loadMaintenancePlans>>[number];

// active schedules due today, overdue, or due within the week
export async function loadUpcomingPlans(today = manilaCalendarDate(), take = 6) {
  const plans = await prisma.maintenancePlan.findMany({
    where: { isActive: true, nextDueOn: { lte: dayDate(addDays(today, dueSoonDays)) } },
    include: planInclude,
    orderBy: [{ nextDueOn: "asc" }, { title: "asc" }],
    take,
  });
  return plans.map((plan) => ({ ...plan, nextDue: dayValue(plan.nextDueOn) }));
}

export async function countDuePlans(today = manilaCalendarDate()) {
  const [overdue, dueToday, soon, active] = await Promise.all([
    prisma.maintenancePlan.count({
      where: { isActive: true, nextDueOn: { lt: dayDate(today) } },
    }),
    prisma.maintenancePlan.count({ where: { isActive: true, nextDueOn: dayDate(today) } }),
    prisma.maintenancePlan.count({
      where: {
        isActive: true,
        nextDueOn: { gt: dayDate(today), lte: dayDate(addDays(today, dueSoonDays)) },
      },
    }),
    prisma.maintenancePlan.count({ where: { isActive: true } }),
  ]);
  return { overdue, dueToday, soon, active };
}

// schedules that cover one item, for its record page
export async function loadPlansForItem(item: {
  categoryId: string;
  id: string;
  locationId: string;
}) {
  const plans = await prisma.maintenancePlan.findMany({
    where: {
      isActive: true,
      OR: [
        { itemId: item.id },
        {
          itemId: null,
          AND: [
            { OR: [{ categoryId: null }, { categoryId: item.categoryId }] },
            { OR: [{ locationId: null }, { locationId: item.locationId }] },
          ],
        },
      ],
    },
    include: planInclude,
    orderBy: { nextDueOn: "asc" },
    take: 10,
  });
  return plans.map((plan) => ({ ...plan, nextDue: dayValue(plan.nextDueOn) }));
}

// for the calendar, active schedules due in a date range
export async function loadPlansDueBetween(startDay: Date, endDay: Date, take = 250) {
  return prisma.maintenancePlan.findMany({
    where: { isActive: true, nextDueOn: { gte: startDay, lt: endDay } },
    include: planInclude,
    orderBy: { nextDueOn: "asc" },
    take,
  });
}
