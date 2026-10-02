import { ItemCondition, ItemStatus, type Prisma } from "@prisma/client";

const attentionStatuses: ItemStatus[] = [ItemStatus.DEFECTIVE, ItemStatus.NOT_TESTED];
const attentionConditions: ItemCondition[] = [ItemCondition.POOR, ItemCondition.FOR_REPAIR];

export const reportAttentionWhere: Prisma.InventoryItemWhereInput = {
  OR: [{ status: { in: attentionStatuses } }, { condition: { in: attentionConditions } }],
};

export function needsReportAttention(item: { status: ItemStatus; condition: ItemCondition }) {
  return attentionStatuses.includes(item.status) || attentionConditions.includes(item.condition);
}
