import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { PublicRequestKind } from "@prisma/client";

import { prisma } from "@/prisma";
import { clientAddress, rateLimitSecret } from "./client-address";

// per ip limit on failed sign ins, on top of the account lock (which doesn't catch guesses spread over many usernames). only failures count
export const maxFailedSignIns = 30;
const windowMs = 15 * 60 * 1000;

async function deviceFingerprint() {
  const address = clientAddress(await headers());
  // ip only, user agents are easy to change
  return createHmac("sha256", rateLimitSecret()).update(`sign-in:${address}`).digest("hex");
}

export async function isSignInThrottled() {
  const fingerprint = await deviceFingerprint();
  const row = await prisma.publicRequestAttempt.findUnique({
    where: { fingerprint_kind: { fingerprint, kind: PublicRequestKind.SIGN_IN } },
    select: { attempts: true, windowStartedAt: true },
  });
  return Boolean(
    row &&
    row.windowStartedAt.getTime() > Date.now() - windowMs &&
    row.attempts >= maxFailedSignIns,
  );
}

// two at the same moment might count as one, that's fine
export async function recordFailedSignInAttempt() {
  const fingerprint = await deviceFingerprint();
  const key = { fingerprint_kind: { fingerprint, kind: PublicRequestKind.SIGN_IN } };
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const existing = await tx.publicRequestAttempt.findUnique({
        where: key,
        select: { windowStartedAt: true },
      });
      if (!existing) {
        await tx.publicRequestAttempt.create({
          data: { fingerprint, kind: PublicRequestKind.SIGN_IN, windowStartedAt: now },
        });
      } else if (existing.windowStartedAt.getTime() <= now.getTime() - windowMs) {
        await tx.publicRequestAttempt.update({
          where: key,
          data: { attempts: 1, windowStartedAt: now },
        });
      } else {
        await tx.publicRequestAttempt.update({
          where: key,
          data: { attempts: { increment: 1 } },
        });
      }
    });
  } catch (error) {
    console.error("Unable to record a failed sign-in", error);
  }
}
