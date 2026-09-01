ALTER TABLE "Category" ADD COLUMN "assetTagCode" VARCHAR(3);
ALTER TABLE "Location" ADD COLUMN "assetTagCode" VARCHAR(2);
ALTER TABLE "InventoryItem" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
ALTER TABLE "Computer" ADD COLUMN "hardwareDescription" TEXT;
ALTER TABLE "Computer" ADD COLUMN "softwareDescription" TEXT;

UPDATE "Category" AS category
SET "assetTagCode" = source.code
FROM (
  SELECT DISTINCT ON ("categoryId")
    "categoryId",
    split_part("assetTag", '-', 2) AS code
  FROM "InventoryItem"
  WHERE "assetTag" ~ '^INV-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}-[0-9]{4}$'
  ORDER BY "categoryId", "createdAt" ASC
) AS source
WHERE category.id = source."categoryId";

UPDATE "Location" AS location
SET "assetTagCode" = source.code
FROM (
  SELECT DISTINCT ON ("locationId")
    "locationId",
    split_part("assetTag", '-', 4) AS code
  FROM "InventoryItem"
  WHERE "assetTag" ~ '^INV-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}-[0-9]{4}$'
  ORDER BY "locationId", "createdAt" ASC
) AS source
WHERE location.id = source."locationId";

UPDATE "InventoryItem" AS item
SET "lastCheckedAt" = computer."lastCheckedAt"
FROM "Computer" AS computer
WHERE computer."itemId" = item.id AND computer."lastCheckedAt" IS NOT NULL;

CREATE UNIQUE INDEX "Category_assetTagCode_key" ON "Category"("assetTagCode");
CREATE UNIQUE INDEX "Location_assetTagCode_key" ON "Location"("assetTagCode");
CREATE INDEX "InventoryItem_lastCheckedAt_idx" ON "InventoryItem"("lastCheckedAt");
