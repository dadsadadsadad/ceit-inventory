import { inventoryAttentionWhere, needsInventoryAttention } from "@/lib/inventory-attention";

// Reports, the dashboard, and the inventory filter all share one definition of "needs attention".
export const reportAttentionWhere = inventoryAttentionWhere;

export const needsReportAttention = needsInventoryAttention;
