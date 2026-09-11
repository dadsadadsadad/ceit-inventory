import { manilaCalendarDate } from "./manila-date";

export type ScheduledLoan = {
  startsAt: Date;
  expectedReturnDate: Date;
  requestedQuantity: number;
  status: string;
};

export function manilaDateTimeInput(date = new Date()) {
  return `${manilaCalendarDate(date)}T${String((date.getUTCHours() + 8) % 24).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function parseManilaDateTime(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error(`Choose a valid ${label}.`);
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || manilaDateTimeInput(date) !== value) throw new Error(`Choose a valid ${label}.`);
  return date;
}

export function validateBorrowSchedule(startsAt: Date, endsAt: Date, isReservation: boolean, now = new Date()) {
  const year = 366 * 24 * 60 * 60 * 1000;
  if (![startsAt, endsAt].every((date) => Number.isFinite(date.getTime()))) throw new Error("Choose valid borrowing dates.");
  if (isReservation && startsAt < now) throw new Error("Choose a pickup time in the future.");
  if (endsAt <= startsAt || endsAt <= now) throw new Error("Return time must be after pickup time.");
  if (startsAt.getTime() > now.getTime() + year || endsAt.getTime() > now.getTime() + year) throw new Error("Choose dates within the next year.");
}

/** Peak concurrent demand, rather than the sum of unrelated bookings. Intervals are [start, end). */
export function availableScheduledQuantity(capacity: number, loans: ScheduledLoan[], startsAt: Date, endsAt: Date, now = new Date()) {
  const start = startsAt.getTime();
  const end = endsAt.getTime();
  const events: { at: number; delta: number }[] = [];
  for (const loan of loans) {
    const checkedOut = loan.status === "BORROWED" || loan.status === "RETURN_REQUESTED";
    if (!checkedOut && loan.status !== "REQUESTED" && loan.status !== "RESERVED") continue;
    // An overdue physical loan remains unavailable until staff confirm its return.
    const loanEnd = checkedOut && loan.expectedReturnDate <= now ? Infinity : loan.expectedReturnDate.getTime();
    const loanStart = loan.startsAt.getTime();
    if (loanStart >= end || loanEnd <= start) continue;
    events.push({ at: Math.max(start, loanStart), delta: loan.requestedQuantity });
    events.push({ at: Math.min(end, loanEnd), delta: -loan.requestedQuantity });
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let demand = 0;
  let peak = 0;
  for (const event of events) { demand += event.delta; peak = Math.max(peak, demand); }
  return Math.max(0, capacity - peak);
}
