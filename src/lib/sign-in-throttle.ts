import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { PublicRequestKind } from "@prisma/client";

import { prisma } from "@/prisma";

/**
 * A limit on failed sign-ins from one device (its network address), on top of the lock on each
 * account. The account lock cannot tell a thousand guesses at a thousand different usernames
 * from ordinary typing, and every guess costs the server a deliberately slow password check.
 * Only failures are counted, so signing in normally never uses it up.
 */
export const maximumFailedSignIns = 30;
const windowMs = 15 * 60 * 1000;

async function deviceFingerprint() {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  const secret =
    process.env.REQUEST_RATE_LIMIT_SECRET ??
    process.env.SCHOOL_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!secret) {
    throw new Error("Sign-in protection is not configured.");
  }
  // The network address alone, because a script changes its browser name as easily as it likes.
  return createHmac("sha256", secret).update(`sign-in:${address}`).digest("hex");
}

/** Has this device used up its failed sign-ins for now? */
export async function isSignInThrottled() {
  const fingerprint = await deviceFingerprint();
  const row = await prisma.publicRequestAttempt.findUnique({
    where: { fingerprint_kind: { fingerprint, kind: PublicRequestKind.SIGN_IN } },
    select: { attempts: true, windowStartedAt: true },
  });
  return Boolean(
    row &&
    row.windowStartedAt.getTime() > Date.now() - windowMs &&
    row.attempts >= maximumFailedSignIns,
  );
}

/** Count one failed sign-in. Two at the very same moment may count as one, which is harmless. */
export async function recordFailedSignInAttempt() {
  const fingerprint = await deviceFingerprint();
  const key = { fingerprint_kind: { fingerprint, kind: PublicRequestKind.SIGN_IN } };
  try {
    await prisma.$transaction(async (transaction) => {
      const now = new Date();
      const existing = await transaction.publicRequestAttempt.findUnique({
        where: key,
        select: { windowStartedAt: true },
      });
      if (!existing) {
        await transaction.publicRequestAttempt.create({
          data: { fingerprint, kind: PublicRequestKind.SIGN_IN, windowStartedAt: now },
        });
      } else if (existing.windowStartedAt.getTime() <= now.getTime() - windowMs) {
        await transaction.publicRequestAttempt.update({
          where: key,
          data: { attempts: 1, windowStartedAt: now },
        });
      } else {
        await transaction.publicRequestAttempt.update({
          where: key,
          data: { attempts: { increment: 1 } },
        });
      }
    });
  } catch (error) {
    console.error("Unable to record a failed sign-in", error);
  }
}
