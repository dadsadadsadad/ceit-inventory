ALTER TABLE "InventoryItem"
  ADD COLUMN "isComputer" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "InventoryItem_pc_assets_are_single_records" CHECK (NOT "isComputer" OR ("itemType" = 'ASSET' AND quantity = 1));

UPDATE "InventoryItem" AS item
SET "isComputer" = true
FROM "Computer" AS computer
WHERE computer."itemId" = item.id;

CREATE OR REPLACE FUNCTION "check_computer_item_semantics"() RETURNS TRIGGER AS $$
DECLARE
  parent_type "ItemType";
  parent_quantity INTEGER;
  parent_is_computer BOOLEAN;
BEGIN
  SELECT "itemType", quantity, "isComputer"
  INTO parent_type, parent_quantity, parent_is_computer
  FROM "InventoryItem"
  WHERE id = NEW."itemId";

  IF parent_type IS NULL OR parent_type <> 'ASSET' OR parent_quantity <> 1 OR NOT parent_is_computer THEN
    RAISE EXCEPTION 'A computer record requires a PC-designated single tracked asset.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_inventory_item_computer_semantics"() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW."itemType" <> 'ASSET' OR NEW.quantity <> 1 OR NOT NEW."isComputer")
    AND EXISTS (SELECT 1 FROM "Computer" WHERE "itemId" = NEW.id) THEN
    RAISE EXCEPTION 'An item with PC details must remain a PC-designated single tracked asset.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "InventoryItem_computer_semantics" ON "InventoryItem";
CREATE TRIGGER "InventoryItem_computer_semantics"
  BEFORE UPDATE OF "itemType", quantity, "isComputer" ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION "check_inventory_item_computer_semantics"();
