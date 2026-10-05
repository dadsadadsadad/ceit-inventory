import { ItemStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkLoanExtension } from "@/lib/loan-availability";

const now = new Date("2026-10-06T00:00:00+08:00");
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

type OtherLoan = {
  checkedOutItemStatus: ItemStatus | null;
  expectedReturnDate: Date;
  requestedQuantity: number;
  startsAt: Date;
  status: string;
};

function transaction(quantity: number, others: OtherLoan[]) {
  return {
    inventoryItem: { findUnique: vi.fn().mockResolvedValue({ quantity }) },
    borrowRequest: { findMany: vi.fn().mockResolvedValue(others) },
  } as never;
}

const individualLoan = {
  id: "loan",
  inventoryItemId: "item",
  requestedQuantity: 1,
  checkedOutItemStatus: ItemStatus.OK,
};

describe("extending a checked-out loan", () => {
  it("allows a longer loan when nobody else has booked the equipment", async () => {
    await expect(
      checkLoanExtension(transaction(1, []), individualLoan, at(48), now),
    ).resolves.toBeUndefined();
  });

  it("blocks an extension that runs into a later reservation", async () => {
    const reservation: OtherLoan = {
      checkedOutItemStatus: null,
      expectedReturnDate: at(30),
      requestedQuantity: 1,
      startsAt: at(24),
      status: "RESERVED",
    };
    await expect(
      checkLoanExtension(transaction(1, [reservation]), individualLoan, at(48), now),
    ).rejects.toThrow("requested or reserved by someone else");
  });

  it("allows an extension that finishes before the next reservation starts", async () => {
    const reservation: OtherLoan = {
      checkedOutItemStatus: null,
      expectedReturnDate: at(30),
      requestedQuantity: 1,
      startsAt: at(24),
      status: "RESERVED",
    };
    await expect(
      checkLoanExtension(transaction(1, [reservation]), individualLoan, at(24), now),
    ).resolves.toBeUndefined();
  });

  it("counts older quantity-based loans as part of the physical stock", async () => {
    // 5 units in total: 1 left on the shelf, this loan holds 2 and another loan holds 2.
    const otherQuantityLoan: OtherLoan = {
      checkedOutItemStatus: null,
      expectedReturnDate: at(100),
      requestedQuantity: 2,
      startsAt: at(-10),
      status: "BORROWED",
    };
    const quantityLoan = { ...individualLoan, requestedQuantity: 2, checkedOutItemStatus: null };
    await expect(
      checkLoanExtension(transaction(1, [otherQuantityLoan]), quantityLoan, at(48), now),
    ).resolves.toBeUndefined();
  });
});
