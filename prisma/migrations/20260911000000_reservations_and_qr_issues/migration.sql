ALTER TYPE "BorrowStatus" ADD VALUE 'RESERVED';
ALTER TYPE "BorrowStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PublicRequestKind" ADD VALUE 'ISSUE';

ALTER TABLE "BorrowRequest"
  ADD COLUMN "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "isReservation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByName" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);
UPDATE "BorrowRequest" SET "startsAt" = COALESCE("processedAt", "requestedAt");
CREATE INDEX "BorrowRequest_inventoryItemId_status_startsAt_expectedRetur_idx"
  ON "BorrowRequest"("inventoryItemId", "status", "startsAt", "expectedReturnDate");
ALTER TABLE "MaintenanceTicket" ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'STAFF';
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_source_check" CHECK ("source" IN ('STAFF', 'QR'));
