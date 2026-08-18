CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "ItemType" AS ENUM ('ASSET', 'SUPPLY');
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'IN_STORAGE', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST');
CREATE TYPE "ItemCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'FOR_REPAIR');
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'MOVED', 'STATUS_CHANGED', 'SCANNED');

CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "building" TEXT,
    "floor" TEXT,
    "roomNumber" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "assetTag" TEXT,
    "qrCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "ItemType" NOT NULL DEFAULT 'ASSET',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "minimumQuantity" INTEGER,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "warrantyEndsAt" TIMESTAMP(3),
    "notes" TEXT,
    "imageUrl" TEXT,
    "categoryId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Computer" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "operatingSystem" TEXT,
    "osVersion" TEXT,
    "processor" TEXT,
    "memoryGb" INTEGER,
    "storageGb" INTEGER,
    "storageType" TEXT,
    "graphics" TEXT,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Computer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComputerSoftware" (
    "id" UUID NOT NULL,
    "computerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "licenseKeyHint" TEXT,
    "licenseExpiresAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComputerSoftware_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryAudit" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Location_name_idx" ON "Location"("name");
CREATE UNIQUE INDEX "Location_building_roomNumber_key" ON "Location"("building", "roomNumber");
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "InventoryItem_assetTag_key" ON "InventoryItem"("assetTag");
CREATE UNIQUE INDEX "InventoryItem_qrCode_key" ON "InventoryItem"("qrCode");
CREATE UNIQUE INDEX "InventoryItem_serialNumber_key" ON "InventoryItem"("serialNumber");
CREATE INDEX "InventoryItem_locationId_status_idx" ON "InventoryItem"("locationId", "status");
CREATE INDEX "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");
CREATE INDEX "InventoryItem_itemType_idx" ON "InventoryItem"("itemType");
CREATE UNIQUE INDEX "Computer_itemId_key" ON "Computer"("itemId");
CREATE UNIQUE INDEX "Computer_macAddress_key" ON "Computer"("macAddress");
CREATE UNIQUE INDEX "ComputerSoftware_computerId_name_key" ON "ComputerSoftware"("computerId", "name");
CREATE INDEX "InventoryAudit_itemId_createdAt_idx" ON "InventoryAudit"("itemId", "createdAt");

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Computer" ADD CONSTRAINT "Computer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComputerSoftware" ADD CONSTRAINT "ComputerSoftware_computerId_fkey" FOREIGN KEY ("computerId") REFERENCES "Computer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryAudit" ADD CONSTRAINT "InventoryAudit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Computer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComputerSoftware" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryAudit" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "Location", "Category", "InventoryItem", "Computer", "ComputerSoftware", "InventoryAudit" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "Location", "Category", "InventoryItem", "Computer", "ComputerSoftware", "InventoryAudit" FROM authenticated;
  END IF;
END $$;
