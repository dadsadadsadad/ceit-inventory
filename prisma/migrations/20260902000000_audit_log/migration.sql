-- make the item history a general audit log, entries stay when an item is deleted
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BORROWED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SIGNED_IN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SIGNED_OUT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORTED';

ALTER TABLE "InventoryAudit"
  ALTER COLUMN "itemId" DROP NOT NULL,
  ADD COLUMN "entityType" TEXT,
  ADD COLUMN "entityId" TEXT,
  ADD COLUMN "entityLabel" TEXT;

UPDATE "InventoryAudit" AS audit
SET
  "entityType" = 'inventory-item',
  "entityId" = audit."itemId"::TEXT,
  "entityLabel" = COALESCE(item."assetTag", item."name")
FROM "InventoryItem" AS item
WHERE audit."itemId" = item."id";

ALTER TABLE "InventoryAudit" DROP CONSTRAINT "InventoryAudit_itemId_fkey";
ALTER TABLE "InventoryAudit"
  ADD CONSTRAINT "InventoryAudit_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InventoryAudit_entityType_entityId_createdAt_idx"
  ON "InventoryAudit"("entityType", "entityId", "createdAt");
