CREATE TYPE "ItemStatus_new" AS ENUM (
  'OK',
  'WORKING',
  'DEPLOYED',
  'DEFECTIVE',
  'NOT_TESTED',
  'RETIRED',
  'LOST'
);

ALTER TABLE "InventoryItem" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "InventoryItem"
  ALTER COLUMN "status" TYPE "ItemStatus_new"
  USING (
    CASE "status"::text
      WHEN 'ACTIVE' THEN 'OK'
      WHEN 'IN_STORAGE' THEN 'NOT_TESTED'
      WHEN 'UNDER_MAINTENANCE' THEN 'DEFECTIVE'
      WHEN 'RETIRED' THEN 'RETIRED'
      WHEN 'LOST' THEN 'LOST'
      ELSE 'NOT_TESTED'
    END
  )::"ItemStatus_new";

DROP TYPE "ItemStatus";
ALTER TYPE "ItemStatus_new" RENAME TO "ItemStatus";
ALTER TABLE "InventoryItem" ALTER COLUMN "status" SET DEFAULT 'OK';
