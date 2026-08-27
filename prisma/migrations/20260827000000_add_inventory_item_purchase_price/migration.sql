ALTER TABLE "InventoryItem"
  ADD COLUMN "purchasePrice" DECIMAL(12,2);

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_purchasePrice_nonnegative_check"
  CHECK ("purchasePrice" IS NULL OR "purchasePrice" >= 0);
