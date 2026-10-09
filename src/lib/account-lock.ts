import "server-only";

import { runTransaction } from "./database-transaction";

/** Five wrong passwords in fifteen minutes lock the account for fifteen minutes. */
const failedPasswordWindowMs = 15 * 60 * 1000;
const lockDurationMs = 15 * 60 * 1000;
const maximumFailedPasswords = 5;

export function isAccountLocked(user: { lockedUntil: Date | null }, now = new Date()) {
  return Boolean(user.lockedUntil && user.lockedUntil > now);
}

/** Count a wrong password for an account, locking it after too many. Returns whether it is locked. */
export async function recordFailedPassword(userId: string) {
  return runTransaction(async (transaction) => {
    const current = await transaction.user.findUnique({ where: { id: userId } });
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
      failedSignInCount >= maximumFailedPasswords ? new Date(now.getTime() + lockDurationMs) : null;
    await transaction.user.update({
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
