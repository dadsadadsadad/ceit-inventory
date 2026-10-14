import "server-only";

import { runTransaction } from "./database-transaction";

// 5 wrong passwords in 15 min locks the account for 15 min
const failedPasswordWindowMs = 15 * 60 * 1000;
const lockDurationMs = 15 * 60 * 1000;
const maxFailedPasswords = 5;

export function isAccountLocked(user: { lockedUntil: Date | null }, now = new Date()) {
  return Boolean(user.lockedUntil && user.lockedUntil > now);
}

// returns true if the account is now locked
export async function recordFailedPassword(userId: string) {
  return runTransaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) {
      return false;
    }
    const now = new Date();
    if (isAccountLocked(current, now)) {
      return true;
    }
    const isNewWindow =
      !current.firstFailedSignInAt ||
      now.getTime() - current.firstFailedSignInAt.getTime() > failedPasswordWindowMs;
    const failedSignInCount = isNewWindow ? 1 : current.failedSignInCount + 1;
    const lockedUntil =
      failedSignInCount >= maxFailedPasswords ? new Date(now.getTime() + lockDurationMs) : null;
    await tx.user.update({
      where: { id: userId },
      data: {
        failedSignInCount,
        firstFailedSignInAt: isNewWindow ? now : current.firstFailedSignInAt,
        lockedUntil,
      },
    });
    return Boolean(lockedUntil);
  }, 5);
}
