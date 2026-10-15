ALTER TABLE "InventoryItem"
  DROP CONSTRAINT IF EXISTS "InventoryItem_minimumQuantity_nonnegative",
  DROP CONSTRAINT IF EXISTS "InventoryItem_assets_have_no_minimumQuantity";

ALTER TABLE "InventoryItem" DROP COLUMN IF EXISTS "minimumQuantity";
