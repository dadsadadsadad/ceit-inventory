ALTER TYPE "BorrowStatus" ADD VALUE IF NOT EXISTS 'RETURN_REQUESTED';

CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

ALTER TABLE "BorrowRequest"
  ADD COLUMN "returnRequestedAt" TIMESTAMP(3),
  ADD COLUMN "returnRequestNotes" TEXT;

CREATE INDEX "BorrowRequest_status_returnRequestedAt_idx" ON "BorrowRequest"("status", "returnRequestedAt");

CREATE TABLE "MaintenanceTicket" (
  "id" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
  "reportedByName" TEXT,
  "assignedToName" TEXT,
  "resolutionNotes" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceTicket_inventoryItemId_status_idx" ON "MaintenanceTicket"("inventoryItemId", "status");
CREATE INDEX "MaintenanceTicket_status_priority_openedAt_idx" ON "MaintenanceTicket"("status", "priority", "openedAt");

ALTER TABLE "MaintenanceTicket"
  ADD CONSTRAINT "MaintenanceTicket_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenanceTicket" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "MaintenanceTicket" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "MaintenanceTicket" FROM authenticated;
  END IF;
END $$;
