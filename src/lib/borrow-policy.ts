// borrowing limits, each can be overridden with an env var (see .env.example)
export type BorrowPolicy = {
  maxAdvanceDays: number;
  maxLoanDays: number;
  // including extensions
  maxTotalLoanDays: number;
  // pending, reserved or borrowed
  maxActiveRequestsPerStudent: number;
  pickupGraceHours: number;
  pendingHoldHours: number;
};

export const defaultBorrowPolicy: BorrowPolicy = {
  maxAdvanceDays: 3,
  maxLoanDays: 7,
  maxTotalLoanDays: 14,
  maxActiveRequestsPerStudent: 3,
  pickupGraceHours: 2,
  pendingHoldHours: 24,
};

const settings: Record<keyof BorrowPolicy, { env: string; min: number; max: number }> = {
  maxAdvanceDays: { env: "BORROW_MAX_ADVANCE_DAYS", min: 1, max: 30 },
  maxLoanDays: { env: "BORROW_MAX_LOAN_DAYS", min: 1, max: 60 },
  maxTotalLoanDays: { env: "BORROW_MAX_TOTAL_LOAN_DAYS", min: 1, max: 120 },
  maxActiveRequestsPerStudent: { env: "BORROW_MAX_ACTIVE_REQUESTS", min: 1, max: 20 },
  pickupGraceHours: { env: "BORROW_PICKUP_GRACE_HOURS", min: 0, max: 48 },
  pendingHoldHours: { env: "BORROW_PENDING_HOLD_HOURS", min: 1, max: 168 },
};

function integerSetting(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value || !/^\d+$/.test(value.trim())) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

// total can't be shorter than one loan
export function borrowPolicyFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): BorrowPolicy {
  const policy = { ...defaultBorrowPolicy };
  for (const key of Object.keys(settings) as (keyof BorrowPolicy)[]) {
    const setting = settings[key];
    policy[key] = integerSetting(
      env[setting.env],
      defaultBorrowPolicy[key],
      setting.min,
      setting.max,
    );
  }
  policy.maxTotalLoanDays = Math.max(policy.maxTotalLoanDays, policy.maxLoanDays);
  return policy;
}

export const hourMs = 60 * 60 * 1000;
export const dayMs = 24 * hourMs;

export function dayCount(days: number) {
  return `${days} day${days === 1 ? "" : "s"}`;
}
