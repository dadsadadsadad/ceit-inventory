ALTER TABLE "InventoryItem"
  DROP COLUMN IF EXISTS "warrantyEndsAt",
  DROP COLUMN IF EXISTS "imageUrl";

CREATE TABLE "InventoryItemPhoto" (
  "id" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryItemPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryItemPhoto_content_type_check" CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT "InventoryItemPhoto_byte_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 3145728),
  CONSTRAINT "InventoryItemPhoto_data_size_check" CHECK (octet_length("data") > 0 AND octet_length("data") <= 3145728)
);

CREATE INDEX "InventoryItemPhoto_inventoryItemId_createdAt_idx" ON "InventoryItemPhoto"("inventoryItemId", "createdAt");

ALTER TABLE "InventoryItemPhoto"
  ADD CONSTRAINT "InventoryItemPhoto_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryItemPhoto" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "InventoryItemPhoto" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "InventoryItemPhoto" FROM authenticated;
  END IF;
END $$;
