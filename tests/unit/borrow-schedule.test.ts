import { describe, expect, it } from "vitest";
import { availableScheduledQuantity, manilaDateTimeInput, parseManilaDateTime, validateBorrowSchedule, type ScheduledLoan } from "@/lib/borrow-schedule";

const at = (hour: number) => new Date(`2026-09-11T${String(hour).padStart(2, "0")}:00:00+08:00`);
const loan = (start: number, end: number, status = "RESERVED", quantity = 1): ScheduledLoan => ({ startsAt: at(start), expectedReturnDate: at(end), status, requestedQuantity: quantity });

describe("borrowing dates", () => {
  it("uses Philippine time even across UTC midnight", () => {
    expect(manilaDateTimeInput(new Date("2026-09-10T18:30:00Z"))).toBe("2026-09-11T02:30");
    expect(parseManilaDateTime("2026-09-11T02:30", "pickup").toISOString()).toBe("2026-09-10T18:30:00.000Z");
  });
  it.each(["2026-02-30T12:00", "2026-09-11T25:00", "2026-09-11", "garbage"])("rejects invalid input %s", (value) => expect(() => parseManilaDateTime(value, "pickup")).toThrow());
  it("allows same-day loans and rejects reverse or elapsed times", () => {
    expect(() => validateBorrowSchedule(at(9), at(10), false, at(9))).not.toThrow();
    expect(() => validateBorrowSchedule(at(9), at(9), false, at(9))).toThrow();
    expect(() => validateBorrowSchedule(at(8), at(10), true, at(9))).toThrow();
  });
  it("limits future dates", () => expect(() => validateBorrowSchedule(at(9), new Date("2028-01-01"), false, at(9))).toThrow());
});

describe("reservation availability", () => {
  it("blocks overlapping approved and pending bookings", () => {
    expect(availableScheduledQuantity(1, [loan(9, 11)], at(10), at(12), at(8))).toBe(0);
    expect(availableScheduledQuantity(1, [loan(9, 11, "REQUESTED")], at(10), at(12), at(8))).toBe(0);
  });
  it("allows back-to-back bookings", () => expect(availableScheduledQuantity(1, [loan(9, 11)], at(11), at(12), at(8))).toBe(1));
  it("counts peak overlap, not all reservations across the period", () => expect(availableScheduledQuantity(2, [loan(9, 10), loan(11, 12)], at(9), at(13), at(8))).toBe(1));
  it("blocks overdue equipment until its return is confirmed", () => {
    expect(availableScheduledQuantity(1, [loan(7, 8, "BORROWED")], at(12), at(14), at(10))).toBe(0);
    expect(availableScheduledQuantity(1, [loan(7, 8, "RETURN_REQUESTED")], at(12), at(14), at(10))).toBe(0);
  });
  it("does not block expired, cancelled, declined, or returned bookings", () => {
    const loans = [loan(7, 8), loan(10, 12, "CANCELLED"), loan(10, 12, "DECLINED"), loan(10, 12, "RETURNED")];
    expect(availableScheduledQuantity(1, loans, at(10), at(12), at(9))).toBe(1);
  });
  it("accounts for quantity and simultaneous starts and endings", () => expect(availableScheduledQuantity(4, [loan(9, 10, "RESERVED", 2), loan(10, 11, "RESERVED", 3)], at(9), at(12), at(8))).toBe(1));
});
