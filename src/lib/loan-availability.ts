import "server-only";
import { BorrowStatus, ItemStatus, ItemType, type Prisma } from "@prisma/client";
import { canBorrowInventoryStatus } from "./borrow-availability";
import { availableScheduledQuantity } from "./borrow-schedule";
import { FormError } from "./form-action";

export const activeLoanStatuses = [
  BorrowStatus.REQUESTED,
  BorrowStatus.RESERVED,
  BorrowStatus.BORROWED,
  BorrowStatus.RETURN_REQUESTED,
];

// Check overlapping loans before reserving or checking out stock.
export async function checkLoanAvailability(
  transaction: Prisma.TransactionClient,
  itemId: string,
  startsAt: Date,
  endsAt: Date,
  quantity: number,
  excludeId?: string,
  checkout = false,
) {
  const item = await transaction.inventoryItem.findUnique({
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
  const loans = await transaction.borrowRequest.findMany({
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
    },
  });
  const checkedOut = loans.filter(
    (loan) =>
      loan.status === BorrowStatus.BORROWED || loan.status === BorrowStatus.RETURN_REQUESTED,
  );
  const deployedLoan =
    item.status === ItemStatus.DEPLOYED && checkedOut.some((loan) => loan.checkedOutItemStatus);
  if (!canBorrowInventoryStatus(item.status) && !(deployedLoan && !checkout)) {
    throw new FormError("This item is not available in its current condition or status.");
  }
  // Old quantity-based loans reduced stock; individually tracked loans do not.
  const capacity =
    item.quantity +
    checkedOut
      .filter((loan) => !loan.checkedOutItemStatus)
      .reduce((sum, loan) => sum + loan.requestedQuantity, 0);
  if (checkout && checkedOut.some((loan) => loan.checkedOutItemStatus)) {
    throw new FormError(
      "This item is still with another borrower. Confirm its return before checking it out again.",
    );
  }
  if (quantity > availableScheduledQuantity(capacity, loans, startsAt, endsAt)) {
    throw new FormError(
      "This item is already requested or reserved during those times. Choose a different pickup or return time.",
    );
  }
  return item;
}

// Check that keeping an outstanding loan longer does not collide with someone else's booking.
export async function checkLoanExtension(
  transaction: Prisma.TransactionClient,
  request: {
    checkedOutItemStatus: ItemStatus | null;
    id: string;
    inventoryItemId: string;
    requestedQuantity: number;
  },
  endsAt: Date,
  now = new Date(),
) {
  const item = await transaction.inventoryItem.findUnique({
    where: { id: request.inventoryItemId },
    select: { quantity: true },
  });
  if (!item) {
    throw new FormError("This item no longer exists.");
  }
  const others = await transaction.borrowRequest.findMany({
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
    },
  });
  // Older quantity-based loans removed their units from stock; add those units back to get the
  // physical total. An individually tracked loan never changes the stock quantity.
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
  if (request.requestedQuantity > availableScheduledQuantity(capacity, others, now, endsAt, now)) {
    throw new FormError(
      "This equipment is requested or reserved by someone else during that time. Choose an earlier return time.",
    );
  }
}
