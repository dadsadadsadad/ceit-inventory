import { ItemCondition, ItemStatus, type Prisma } from "@prisma/client";

// retired and lost items are expected to be worn out
const outOfServiceStatuses: ItemStatus[] = [ItemStatus.RETIRED, ItemStatus.LOST];
const attentionStatuses: ItemStatus[] = [ItemStatus.DEFECTIVE, ItemStatus.NOT_TESTED];
const attentionConditions: ItemCondition[] = [ItemCondition.POOR, ItemCondition.FOR_REPAIR];

export const inventoryAttentionWhere: Prisma.InventoryItemWhereInput = {
  AND: [
    { status: { notIn: outOfServiceStatuses } },
    { OR: [{ status: { in: attentionStatuses } }, { condition: { in: attentionConditions } }] },
  ],
};

export function needsInventoryAttention(item: { condition: ItemCondition; status: ItemStatus }) {
  return (
    !outOfServiceStatuses.includes(item.status) &&
    (attentionStatuses.includes(item.status) || attentionConditions.includes(item.condition))
  );
}

export const inspectionIntervalDays = 90;

export function overdueInspectionWhere(now = new Date()): Prisma.InventoryItemWhereInput {
  const cutoff = new Date(now.getTime() - inspectionIntervalDays * 24 * 60 * 60 * 1000);
  return {
    status: { notIn: outOfServiceStatuses },
    OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
  };
}

export const pcReplacementYears = 5;

// pcs past their expected life, going by purchase date
export function replacementDueWhere(now = new Date()): Prisma.InventoryItemWhereInput {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - pcReplacementYears);
  return {
    isComputer: true,
    status: { notIn: outOfServiceStatuses },
    purchaseDate: { lte: cutoff },
  };
}
