import { describe, expect, it } from "vitest";

import { borrowPolicyFromEnvironment, dayCount, defaultBorrowPolicy } from "@/lib/borrow-policy";
import {
  availableScheduledQuantity,
  borrowInputLimits,
  isHoldLapsed,
  validateBorrowSchedule,
  type ScheduledLoan,
} from "@/lib/borrow-schedule";

const now = new Date("2026-10-06T09:00:00+08:00");
const hours = (value: number) => new Date(now.getTime() + value * 3_600_000);
const days = (value: number) => hours(value * 24);

describe("borrowing policy settings", () => {
  it("defaults to three days ahead and seven days per loan", () => {
    expect(defaultBorrowPolicy.maximumAdvanceDays).toBe(3);
    expect(defaultBorrowPolicy.maximumLoanDays).toBe(7);
    expect(borrowPolicyFromEnvironment({})).toEqual(defaultBorrowPolicy);
  });

  it("accepts valid overrides and ignores values out of range", () => {
    const policy = borrowPolicyFromEnvironment({
      BORROW_MAX_ADVANCE_DAYS: "5",
      BORROW_MAX_LOAN_DAYS: "0",
      BORROW_MAX_ACTIVE_REQUESTS: "not a number",
      BORROW_PICKUP_GRACE_HOURS: "4",
    });
    expect(policy.maximumAdvanceDays).toBe(5);
    expect(policy.maximumLoanDays).toBe(defaultBorrowPolicy.maximumLoanDays);
    expect(policy.maximumActiveRequestsPerStudent).toBe(
      defaultBorrowPolicy.maximumActiveRequestsPerStudent,
    );
    expect(policy.pickupGraceHours).toBe(4);
  });

  it("never lets the total loan length be shorter than one loan", () => {
    const policy = borrowPolicyFromEnvironment({
      BORROW_MAX_LOAN_DAYS: "30",
      BORROW_MAX_TOTAL_LOAN_DAYS: "10",
    });
    expect(policy.maximumTotalLoanDays).toBe(30);
  });

  it("words day counts", () => {
    expect(dayCount(1)).toBe("1 day");
    expect(dayCount(3)).toBe("3 days");
  });
});

describe("reservation and loan limits", () => {
  it("allows a pickup up to three days ahead and rejects later ones", () => {
    expect(() => validateBorrowSchedule(days(3), days(4), true, now)).not.toThrow();
    expect(() => validateBorrowSchedule(hours(3 * 24 + 1), days(4), true, now)).toThrow(
      "up to 3 days in advance",
    );
  });

  it("does not apply the advance limit to a borrow-now request", () => {
    expect(() => validateBorrowSchedule(now, days(2), false, now)).not.toThrow();
  });

  it("caps how long equipment can be kept", () => {
    expect(() => validateBorrowSchedule(now, days(7), false, now)).not.toThrow();
    expect(() => validateBorrowSchedule(now, hours(7 * 24 + 1), false, now)).toThrow(
      "at most 7 days",
    );
    expect(() => validateBorrowSchedule(days(2), days(10), true, now)).toThrow("at most 7 days");
  });

  it("respects a custom policy", () => {
    const policy = { ...defaultBorrowPolicy, maximumAdvanceDays: 1, maximumLoanDays: 2 };
    expect(() => validateBorrowSchedule(days(2), days(2.5), true, now, policy)).toThrow(
      "up to 1 day in advance",
    );
    expect(() => validateBorrowSchedule(now, days(3), false, now, policy)).toThrow(
      "at most 2 days",
    );
  });

  it("offers the browser date pickers only the allowed range", () => {
    const limits = borrowInputLimits(defaultBorrowPolicy, undefined, now);
    expect(limits.pickupMin).toBe("2026-10-06T09:00");
    expect(limits.pickupMax).toBe("2026-10-09T09:00");
    expect(limits.returnMax).toBe("2026-10-13T09:00");
    const later = borrowInputLimits(defaultBorrowPolicy, "2026-10-08T10:00", now);
    expect(later.returnMin).toBe("2026-10-08T10:00");
    expect(later.returnMax).toBe("2026-10-15T10:00");
  });
});

describe("holds that lapse", () => {
  const loan = (overrides: Partial<ScheduledLoan>): ScheduledLoan => ({
    startsAt: now,
    expectedReturnDate: days(1),
    requestedQuantity: 1,
    status: "RESERVED",
    ...overrides,
  });

  it("releases an uncollected reservation after the pickup grace period", () => {
    const reservation = loan({ startsAt: hours(-3) });
    expect(isHoldLapsed(reservation, now)).toBe(true);
    expect(isHoldLapsed(loan({ startsAt: hours(-1) }), now)).toBe(false);
  });

  it("releases a pending reservation whose pickup time has passed", () => {
    expect(
      isHoldLapsed(loan({ status: "REQUESTED", isReservation: true, startsAt: hours(-3) }), now),
    ).toBe(true);
  });

  it("releases a stale borrow-now request but not a fresh one", () => {
    expect(
      isHoldLapsed(
        loan({ status: "REQUESTED", isReservation: false, requestedAt: hours(-25) }),
        now,
      ),
    ).toBe(true);
    expect(
      isHoldLapsed(
        loan({ status: "REQUESTED", isReservation: false, requestedAt: hours(-5) }),
        now,
      ),
    ).toBe(false);
  });

  it("never lapses checked-out equipment", () => {
    expect(isHoldLapsed(loan({ status: "BORROWED", startsAt: days(-5) }), now)).toBe(false);
    expect(isHoldLapsed(loan({ status: "RETURN_REQUESTED", startsAt: days(-5) }), now)).toBe(false);
  });

  it("frees the item for others once a reservation is missed", () => {
    const missed = loan({ startsAt: hours(-3), expectedReturnDate: hours(5) });
    expect(availableScheduledQuantity(1, [missed], hours(1), hours(4), now)).toBe(1);
    const collectable = loan({ startsAt: hours(-1), expectedReturnDate: hours(5) });
    expect(availableScheduledQuantity(1, [collectable], hours(1), hours(4), now)).toBe(0);
  });
});
