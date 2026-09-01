-- A checked-out one-unit asset remains one physical record. Store the status it
-- had before checkout so returning it restores availability without changing
-- the asset's quantity or losing whether it was OK versus WORKING.
ALTER TABLE "BorrowRequest"
  ADD COLUMN "checkedOutItemStatus" "ItemStatus";
