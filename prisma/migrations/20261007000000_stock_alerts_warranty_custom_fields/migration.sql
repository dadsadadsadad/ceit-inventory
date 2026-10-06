-- Additive only: new optional columns, one new table, and indexes. Nothing existing is changed or removed,
-- so the previous release keeps working against this schema if this runs first.
--   InventoryItem.lowStockThreshold  stock alert level (empty = default of 5)
--   InventoryItem.warrantyEndsAt     optional warranty end date
--   InventoryItem.customFields       optional extra details, keyed by CustomField id
--   ComputerSoftware.isLicensed      optional "is this copy licensed?"
--   BorrowRequest.remindedAt         when staff last reminded the borrower
--   CustomField                      the extra details staff define in Settings

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'YES_NO', 'CHOICE');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "lowStockThreshold" INTEGER,
ADD COLUMN     "warrantyEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ComputerSoftware" ADD COLUMN     "isLicensed" BOOLEAN;

-- AlterTable
ALTER TABLE "BorrowRequest" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL DEFAULT 'TEXT',
    "choices" TEXT[],
    "appliesTo" "ItemType",
    "categoryId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomField_isActive_sortOrder_idx" ON "CustomField"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryItem_updatedAt_idx" ON "InventoryItem"("updatedAt");

-- CreateIndex
CREATE INDEX "InventoryItem_warrantyEndsAt_idx" ON "InventoryItem"("warrantyEndsAt");

-- CreateIndex
CREATE INDEX "InventoryAudit_createdAt_idx" ON "InventoryAudit"("createdAt");

-- CreateIndex
CREATE INDEX "BorrowRequest_status_expectedReturnDate_idx" ON "BorrowRequest"("status", "expectedReturnDate");

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

