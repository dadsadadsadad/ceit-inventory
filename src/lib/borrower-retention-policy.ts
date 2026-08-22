const defaultRetentionDays = 365;

export function borrowerDataRetentionDays(value?: string) {
  if (!value || !/^\d+$/.test(value)) return defaultRetentionDays;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 30 && days <= 730 ? days : defaultRetentionDays;
}

export function borrowerDataExpiresAt(now: Date, retentionDays = defaultRetentionDays) {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
  return expiresAt;
}
