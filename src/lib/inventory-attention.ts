import { ItemCondition, ItemStatus, type Prisma } from "@prisma/client";

// Records that are no longer in service are expected to be worn out or missing.
const outOfServiceStatuses: ItemStatus[] = [ItemStatus.RETIRED, ItemStatus.LOST];
const attentionStatuses: ItemStatus[] = [ItemStatus.DEFECTIVE, ItemStatus.NOT_TESTED];
const attentionConditions: ItemCondition[] = [ItemCondition.POOR, ItemCondition.FOR_REPAIR];

/** Equipment still in service that is defective, untested, or in poor condition. */
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

/** Items not checked within the inspection interval, or never checked. */
export function overdueInspectionWhere(now = new Date()): Prisma.InventoryItemWhereInput {
  const cutoff = new Date(now.getTime() - inspectionIntervalDays * 24 * 60 * 60 * 1000);
  return {
    status: { notIn: outOfServiceStatuses },
    OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
  };
}
