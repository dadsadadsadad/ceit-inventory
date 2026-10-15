ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_quantity_nonnegative" CHECK (quantity >= 0),
  ADD CONSTRAINT "InventoryItem_minimumQuantity_nonnegative" CHECK ("minimumQuantity" IS NULL OR "minimumQuantity" >= 0),
  ADD CONSTRAINT "InventoryItem_assets_have_no_minimumQuantity" CHECK ("itemType" = 'SUPPLY' OR "minimumQuantity" IS NULL);

ALTER TABLE "Computer"
  ADD CONSTRAINT "Computer_memoryGb_nonnegative" CHECK ("memoryGb" IS NULL OR "memoryGb" >= 0),
  ADD CONSTRAINT "Computer_storageGb_nonnegative" CHECK ("storageGb" IS NULL OR "storageGb" >= 0);

ALTER TABLE "User"
  ADD COLUMN "failedSignInCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "firstFailedSignInAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

DELETE FROM "UserSession";
ALTER TABLE "UserSession" ADD COLUMN "tokenHash" TEXT;
DROP INDEX "UserSession_token_key";
ALTER TABLE "UserSession" DROP COLUMN token;
ALTER TABLE "UserSession" ALTER COLUMN "tokenHash" SET NOT NULL;
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

DROP INDEX "Location_building_roomNumber_key";
CREATE UNIQUE INDEX "Location_building_roomNumber_key" ON "Location"("building", "roomNumber") NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION "check_computer_item_semantics"() RETURNS TRIGGER AS $$
DECLARE
  parent_type "ItemType";
  parent_quantity INTEGER;
BEGIN
  SELECT "itemType", quantity INTO parent_type, parent_quantity FROM "InventoryItem" WHERE id = NEW."itemId";
  IF parent_type IS NULL OR parent_type <> 'ASSET' OR parent_quantity <> 1 THEN
    RAISE EXCEPTION 'A computer record requires a single tracked asset.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_inventory_item_computer_semantics"() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."itemType" <> 'ASSET' OR NEW.quantity <> 1)
    AND EXISTS (SELECT 1 FROM "Computer" WHERE "itemId" = NEW.id) THEN
    RAISE EXCEPTION 'An item with PC details must remain a single tracked asset.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Computer_item_semantics"
  BEFORE INSERT OR UPDATE OF "itemId" ON "Computer"
  FOR EACH ROW EXECUTE FUNCTION "check_computer_item_semantics"();

CREATE TRIGGER "InventoryItem_computer_semantics"
  BEFORE UPDATE OF "itemType", quantity ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION "check_inventory_item_computer_semantics"();
