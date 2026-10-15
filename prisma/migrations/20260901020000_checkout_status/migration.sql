-- remember the status before checkout so returning restores it
ALTER TABLE "BorrowRequest"
  ADD COLUMN "checkedOutItemStatus" "ItemStatus";
