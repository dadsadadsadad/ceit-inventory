import "server-only";
import { BorrowStatus, ItemStatus, ItemType, type Prisma } from "@prisma/client";
import { canBorrowInventoryStatus } from "./borrow-availability";
import { borrowPolicyFromEnvironment } from "./borrow-policy";
import { availableScheduledQuantity } from "./borrow-schedule";
import { FormError } from "./form-action";

export const activeLoanStatuses = [
  BorrowStatus.REQUESTED,
  BorrowStatus.RESERVED,
  BorrowStatus.BORROWED,
  BorrowStatus.RETURN_REQUESTED,
];

export async function checkLoanAvailability(
  tx: Prisma.TransactionClient,
  itemId: string,
  startsAt: Date,
  endsAt: Date,
  quantity: number,
  excludeId?: string,
  checkout = false,
) {
  const item = await tx.inventoryItem.findUnique({
    where: { id: itemId },
    include: { category: { select: { isActive: true } }, location: { select: { isActive: true } } },
  });
  if (
    !item ||
    item.itemType !== ItemType.ASSET ||
    !item.category.isActive ||
    !item.location.isActive
  ) {
    throw new FormError("This item is not available for borrowing.");
  }
  const loans = await tx.borrowRequest.findMany({
    where: {
      inventoryItemId: itemId,
      status: { in: activeLoanStatuses },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      startsAt: true,
      expectedReturnDate: true,
      requestedQuantity: true,
      status: true,
      checkedOutItemStatus: true,
      requestedAt: true,
      isReservation: true,
    },
  });
  const checkedOut = loans.filter(
    (loan) =>
      loan.status === BorrowStatus.BORROWED || loan.status === BorrowStatus.RETURN_REQUESTED,
  );
  // a tracked asset that is out right now shows as DEPLOYED, it can still be reserved for later
  const deployedLoan =
    item.status === ItemStatus.DEPLOYED && checkedOut.some((loan) => loan.checkedOutItemStatus);
  if (!canBorrowInventoryStatus(item.status) && !(deployedLoan && !checkout)) {
    throw new FormError("This item is not available in its current condition or status.");
  }
  // only old quantity loans took from stock
  const capacity =
    item.quantity +
    checkedOut
      .filter((loan) => !loan.checkedOutItemStatus)
      .reduce((sum, loan) => sum + loan.requestedQuantity, 0);
  // one tracked unit can't be checked out twice
  if (checkout && checkedOut.some((loan) => loan.checkedOutItemStatus)) {
    throw new FormError(
      "This item is still with another borrower. Confirm its return before checking it out again.",
    );
  }
  if (
    quantity >
    availableScheduledQuantity(
      capacity,
      loans,
      startsAt,
      endsAt,
      new Date(),
      borrowPolicyFromEnvironment(),
    )
  ) {
    throw new FormError(
      "This item is already requested or reserved during those times. Choose a different pickup or return time.",
    );
  }
  return item;
}

// make sure an extension doesn't overlap another booking
export async function checkLoanExtension(
  tx: Prisma.TransactionClient,
  request: {
    checkedOutItemStatus: ItemStatus | null;
    id: string;
    inventoryItemId: string;
    requestedQuantity: number;
  },
  endsAt: Date,
  now = new Date(),
) {
  const item = await tx.inventoryItem.findUnique({
    where: { id: request.inventoryItemId },
    select: { quantity: true },
  });
  if (!item) {
    throw new FormError("This item no longer exists.");
  }
  const others = await tx.borrowRequest.findMany({
    where: {
      inventoryItemId: request.inventoryItemId,
      status: { in: activeLoanStatuses },
      id: { not: request.id },
    },
    select: {
      startsAt: true,
      expectedReturnDate: true,
      requestedQuantity: true,
      status: true,
      checkedOutItemStatus: true,
      requestedAt: true,
      isReservation: true,
    },
  });
  // add back units old quantity loans took out to get the real total
  const otherQuantityLoans = others
    .filter(
      (loan) =>
        (loan.status === BorrowStatus.BORROWED || loan.status === BorrowStatus.RETURN_REQUESTED) &&
        !loan.checkedOutItemStatus,
    )
    .reduce((sum, loan) => sum + loan.requestedQuantity, 0);
  const capacity =
    item.quantity +
    otherQuantityLoans +
    (request.checkedOutItemStatus ? 0 : request.requestedQuantity);
  if (
    request.requestedQuantity >
    availableScheduledQuantity(capacity, others, now, endsAt, now, borrowPolicyFromEnvironment())
  ) {
    throw new FormError(
      "This equipment is requested or reserved by someone else during that time. Choose an earlier return time.",
    );
  }
}
