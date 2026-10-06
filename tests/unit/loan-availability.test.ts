import { BorrowStatus, ItemStatus, ItemType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkLoanAvailability } from "@/lib/loan-availability";

const now = Date.now();
const at = (hours: number) => new Date(now + hours * 3_600_000);

type Item = Partial<{
  category: { isActive: boolean };
  itemType: ItemType;
  location: { isActive: boolean };
  quantity: number;
  status: ItemStatus;
}>;
type Loan = {
  checkedOutItemStatus: ItemStatus | null;
  expectedReturnDate: Date;
  isReservation: boolean;
  requestedAt: Date;
  requestedQuantity: number;
  startsAt: Date;
  status: BorrowStatus;
};

function database(item: Item | null, loans: Loan[] = []) {
  return {
    inventoryItem: {
      findUnique: vi.fn().mockResolvedValue(
        item && {
          category: { isActive: true },
          itemType: ItemType.ASSET,
          location: { isActive: true },
          quantity: 1,
          status: ItemStatus.OK,
          ...item,
        },
      ),
    },
    borrowRequest: { findMany: vi.fn().mockResolvedValue(loans) },
  } as never;
}

const checkedOut = (returnsInHours: number): Loan => ({
  checkedOutItemStatus: ItemStatus.OK,
  expectedReturnDate: at(returnsInHours),
  isReservation: false,
  requestedAt: at(-3),
  requestedQuantity: 1,
  startsAt: at(-2),
  status: BorrowStatus.BORROWED,
});

const reservation = (startsInHours: number, endsInHours: number): Loan => ({
  checkedOutItemStatus: null,
  expectedReturnDate: at(endsInHours),
  isReservation: true,
  requestedAt: at(-1),
  requestedQuantity: 1,
  startsAt: at(startsInHours),
  status: BorrowStatus.RESERVED,
});

describe("borrowing equipment that may already be out", () => {
  it("lets equipment with no bookings be borrowed now", async () => {
    await expect(
      checkLoanAvailability(database({}), "item", at(0), at(2), 1),
    ).resolves.toBeTruthy();
  });

  it("refuses to lend equipment that is still checked out to someone else", async () => {
    const out = database({ status: ItemStatus.DEPLOYED }, [checkedOut(5)]);
    await expect(checkLoanAvailability(out, "item", at(0), at(2), 1)).rejects.toThrow(
      /already requested or reserved/,
    );
  });

  it("allows a booking for after the current loan is due back", async () => {
    const out = database({ status: ItemStatus.DEPLOYED }, [checkedOut(5)]);
    await expect(checkLoanAvailability(out, "item", at(6), at(8), 1)).resolves.toBeTruthy();
  });

  it("refuses to hand over equipment that has not come back, even to the next booking", async () => {
    const out = database({ status: ItemStatus.DEPLOYED }, [checkedOut(5), reservation(6, 8)]);
    await expect(checkLoanAvailability(out, "item", at(6), at(8), 1, "next", true)).rejects.toThrow(
      /not available in its current condition or status/,
    );
  });

  it("keeps an overdue loan blocking the item until staff confirm the return", async () => {
    const overdue = database({ status: ItemStatus.DEPLOYED }, [checkedOut(-1)]);
    await expect(checkLoanAvailability(overdue, "item", at(0), at(2), 1)).rejects.toThrow(
      /already requested or reserved/,
    );
    await expect(checkLoanAvailability(overdue, "item", at(40), at(42), 1)).rejects.toThrow(
      /already requested or reserved/,
    );
  });

  it("refuses to double book a time that another reservation holds", async () => {
    const booked = database({}, [reservation(10, 14)]);
    await expect(checkLoanAvailability(booked, "item", at(12), at(16), 1)).rejects.toThrow(
      /already requested or reserved/,
    );
    await expect(checkLoanAvailability(booked, "item", at(14), at(16), 1)).resolves.toBeTruthy();
  });

  it("refuses more units than exist", async () => {
    await expect(checkLoanAvailability(database({}), "item", at(0), at(2), 2)).rejects.toThrow(
      /already requested or reserved/,
    );
  });

  it.each([
    ["stock that is counted, not tracked", { itemType: ItemType.SUPPLY }],
    ["an item in an inactive category", { category: { isActive: false } }],
    ["an item in an inactive room", { location: { isActive: false } }],
  ])("refuses to lend %s", async (_label, item) => {
    await expect(checkLoanAvailability(database(item), "item", at(0), at(2), 1)).rejects.toThrow(
      /not available for borrowing/,
    );
  });

  it.each([ItemStatus.DEFECTIVE, ItemStatus.NOT_TESTED, ItemStatus.RETIRED, ItemStatus.LOST])(
    "refuses to lend equipment marked %s",
    async (status) => {
      await expect(
        checkLoanAvailability(database({ status }), "item", at(0), at(2), 1),
      ).rejects.toThrow(/not available in its current condition or status/);
    },
  );

  it("refuses an item that does not exist", async () => {
    await expect(checkLoanAvailability(database(null), "item", at(0), at(2), 1)).rejects.toThrow(
      /not available for borrowing/,
    );
  });
});
