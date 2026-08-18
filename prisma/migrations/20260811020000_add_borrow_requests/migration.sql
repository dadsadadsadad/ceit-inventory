CREATE TYPE "BorrowStatus" AS ENUM ('REQUESTED', 'BORROWED', 'RETURNED', 'DECLINED');

CREATE TABLE "BorrowRequest" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestedQuantity" INTEGER NOT NULL DEFAULT 1,
    "expectedReturnDate" TIMESTAMP(3) NOT NULL,
    "status" "BorrowStatus" NOT NULL DEFAULT 'REQUESTED',
    "staffNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "processedByName" TEXT,
    "returnedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BorrowRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BorrowRequest_requestedQuantity_positive" CHECK ("requestedQuantity" > 0)
);

CREATE INDEX "BorrowRequest_inventoryItemId_status_idx" ON "BorrowRequest"("inventoryItemId", "status");
CREATE INDEX "BorrowRequest_status_requestedAt_idx" ON "BorrowRequest"("status", "requestedAt");

ALTER TABLE "BorrowRequest"
  ADD CONSTRAINT "BorrowRequest_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BorrowRequest" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "BorrowRequest" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "BorrowRequest" FROM authenticated;
  END IF;
END $$;
