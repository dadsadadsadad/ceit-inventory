import { manilaCalendarDate } from "./manila-date";
import { dayCount, dayMs, defaultBorrowPolicy, hourMs, type BorrowPolicy } from "./borrow-policy";

export type ScheduledLoan = {
  startsAt: Date;
  expectedReturnDate: Date;
  requestedQuantity: number;
  status: string;
  requestedAt?: Date;
  isReservation?: boolean;
};

export function manilaDateTimeInput(date = new Date()) {
  return `${manilaCalendarDate(date)}T${String((date.getUTCHours() + 8) % 24).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function parseManilaDateTime(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`Choose a valid ${label}.`);
  }
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || manilaDateTimeInput(date) !== value) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return date;
}

export function validateBorrowSchedule(
  startsAt: Date,
  endsAt: Date,
  isReservation: boolean,
  now = new Date(),
  policy: BorrowPolicy = defaultBorrowPolicy,
) {
  if (![startsAt, endsAt].every((date) => Number.isFinite(date.getTime()))) {
    throw new Error("Choose valid borrowing dates.");
  }
  if (isReservation && startsAt < now) {
    throw new Error("Choose a pickup time in the future.");
  }
  if (endsAt <= startsAt || endsAt <= now) {
    throw new Error("Return time must be after pickup time.");
  }
  if (isReservation && startsAt.getTime() > now.getTime() + policy.maxAdvanceDays * dayMs) {
    throw new Error(
      `Reservations can only be made up to ${dayCount(policy.maxAdvanceDays)} in advance. Choose a pickup time within the next ${dayCount(policy.maxAdvanceDays)}.`,
    );
  }
  if (endsAt.getTime() - startsAt.getTime() > policy.maxLoanDays * dayMs) {
    throw new Error(
      `Equipment can be borrowed for at most ${dayCount(policy.maxLoanDays)} at a time. Choose an earlier return time.`,
    );
  }
}

// min/max for the datetime-local inputs, in manila time
export function borrowInputLimits(
  policy: Pick<BorrowPolicy, "maxAdvanceDays" | "maxLoanDays">,
  pickup?: string,
  now = new Date(),
) {
  const pickupDate =
    pickup && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pickup)
      ? new Date(`${pickup}:00+08:00`)
      : null;
  const start = pickupDate && Number.isFinite(pickupDate.getTime()) ? pickupDate : now;
  return {
    pickupMin: manilaDateTimeInput(now),
    pickupMax: manilaDateTimeInput(new Date(now.getTime() + policy.maxAdvanceDays * dayMs)),
    returnMin: manilaDateTimeInput(start),
    returnMax: manilaDateTimeInput(new Date(start.getTime() + policy.maxLoanDays * dayMs)),
  };
}

// uncollected reservations lapse after the grace period, pending requests after the hold period
export function isHoldLapsed(
  loan: ScheduledLoan,
  now = new Date(),
  policy: BorrowPolicy = defaultBorrowPolicy,
) {
  const pickupDeadline = loan.startsAt.getTime() + policy.pickupGraceHours * hourMs;
  if (loan.status === "RESERVED") {
    return pickupDeadline <= now.getTime();
  }
  if (loan.status === "REQUESTED") {
    if (loan.isReservation) {
      return pickupDeadline <= now.getTime();
    }
    return (
      loan.requestedAt !== undefined &&
      loan.requestedAt.getTime() + policy.pendingHoldHours * hourMs <= now.getTime()
    );
  }
  return false;
}

// peak overlap, not the sum. intervals are [start, end)
export function availableScheduledQuantity(
  capacity: number,
  loans: ScheduledLoan[],
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
  policy: BorrowPolicy = defaultBorrowPolicy,
) {
  const start = startsAt.getTime();
  const end = endsAt.getTime();
  // sweep: +qty when a loan starts, -qty when it ends, keep the highest total
  const events: { at: number; delta: number }[] = [];
  for (const loan of loans) {
    const checkedOut = loan.status === "BORROWED" || loan.status === "RETURN_REQUESTED";
    if (!checkedOut && loan.status !== "REQUESTED" && loan.status !== "RESERVED") {
      continue;
    }
    if (isHoldLapsed(loan, now, policy)) {
      continue;
    }
    // overdue loans block the item until staff confirm the return
    const loanEnd =
      checkedOut && loan.expectedReturnDate <= now ? Infinity : loan.expectedReturnDate.getTime();
    const loanStart = loan.startsAt.getTime();
    if (loanStart >= end || loanEnd <= start) {
      continue;
    }
    events.push({ at: Math.max(start, loanStart), delta: loan.requestedQuantity });
    events.push({ at: Math.min(end, loanEnd), delta: -loan.requestedQuantity });
  }
  //
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let demand = 0;
  let peak = 0;
  for (const event of events) {
    demand += event.delta;
    peak = Math.max(peak, demand);
  }
  return Math.max(0, capacity - peak);
}
