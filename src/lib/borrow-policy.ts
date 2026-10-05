/**
 * Borrowing rules that stop a request from holding equipment forever.
 *
 * The defaults are the department's rules. Each can be changed with an environment variable
 * (see .env.example); values outside the allowed range fall back to the default.
 */
export type BorrowPolicy = {
  /** A reservation's pickup must be within this many days from now. */
  maximumAdvanceDays: number;
  /** The longest a student can ask to keep equipment, from pickup to return. */
  maximumLoanDays: number;
  /** The longest a loan can run in total once staff extend it, from pickup. */
  maximumTotalLoanDays: number;
  /** Requests a student number can have open at once (pending, reserved, or borrowed). */
  maximumActiveRequestsPerStudent: number;
  /** After this many hours past the pickup time, an uncollected reservation releases the item. */
  pickupGraceHours: number;
  /** A "borrow now" request nobody handles for this many hours stops holding the item. */
  pendingHoldHours: number;
};

export const defaultBorrowPolicy: BorrowPolicy = {
  maximumAdvanceDays: 3,
  maximumLoanDays: 7,
  maximumTotalLoanDays: 14,
  maximumActiveRequestsPerStudent: 3,
  pickupGraceHours: 2,
  pendingHoldHours: 24,
};

const settings: Record<keyof BorrowPolicy, { env: string; minimum: number; maximum: number }> = {
  maximumAdvanceDays: { env: "BORROW_MAX_ADVANCE_DAYS", minimum: 1, maximum: 30 },
  maximumLoanDays: { env: "BORROW_MAX_LOAN_DAYS", minimum: 1, maximum: 60 },
  maximumTotalLoanDays: { env: "BORROW_MAX_TOTAL_LOAN_DAYS", minimum: 1, maximum: 120 },
  maximumActiveRequestsPerStudent: { env: "BORROW_MAX_ACTIVE_REQUESTS", minimum: 1, maximum: 20 },
  pickupGraceHours: { env: "BORROW_PICKUP_GRACE_HOURS", minimum: 0, maximum: 48 },
  pendingHoldHours: { env: "BORROW_PENDING_HOLD_HOURS", minimum: 1, maximum: 168 },
};

function integerSetting(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value || !/^\d+$/.test(value.trim())) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

/** The policy in force, from the environment. The total can never be shorter than one loan. */
export function borrowPolicyFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): BorrowPolicy {
  const policy = { ...defaultBorrowPolicy };
  for (const key of Object.keys(settings) as (keyof BorrowPolicy)[]) {
    const setting = settings[key];
    policy[key] = integerSetting(
      environment[setting.env],
      defaultBorrowPolicy[key],
      setting.minimum,
      setting.maximum,
    );
  }
  policy.maximumTotalLoanDays = Math.max(policy.maximumTotalLoanDays, policy.maximumLoanDays);
  return policy;
}

export const hourMs = 60 * 60 * 1000;
export const dayMs = 24 * hourMs;

/** Human wording such as "3 days" or "1 day". */
export function dayCount(days: number) {
  return `${days} day${days === 1 ? "" : "s"}`;
}
