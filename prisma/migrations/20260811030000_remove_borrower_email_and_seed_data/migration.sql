ALTER TABLE IF EXISTS "BorrowRequest" DROP COLUMN IF EXISTS "email";

DROP TABLE IF EXISTS "test";

DELETE FROM "Location" AS location
WHERE location."name" = 'CEIT Computer Laboratory'
  AND location."building" = 'CEIT Building'
  AND location."roomNumber" = 'Lab 1'
  AND NOT EXISTS (
    SELECT 1 FROM "InventoryItem" AS item WHERE item."locationId" = location."id"
  );

DELETE FROM "Category" AS category
WHERE category."name" = 'Desktop Computers'
  AND NOT EXISTS (
    SELECT 1 FROM "InventoryItem" AS item WHERE item."categoryId" = category."id"
  );
