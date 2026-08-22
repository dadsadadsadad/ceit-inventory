import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { Prisma, PublicRequestKind } from "@prisma/client";

import { prisma } from "@/prisma";

const maximumAttempts = 8;
const windowMs = 15 * 60 * 1000;
const cleanupAgeMs = 24 * 60 * 60 * 1000;

function fingerprint(kind: PublicRequestKind, requestHeaders: Headers) {
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || requestHeaders.get("x-real-ip") || "unknown";
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) || "unknown";
  const secret = process.env.REQUEST_RATE_LIMIT_SECRET ?? process.env.SCHOOL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!secret) throw new Error("Public request protection is not configured.");
  return createHmac("sha256", secret).update(`${kind}:${address}:${userAgent}`).digest("hex");
}

function retryableTransactionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034");
}

export async function enforcePublicRequestRateLimit(kind: PublicRequestKind) {
  const requestHeaders = await headers();
  const requestFingerprint = fingerprint(kind, requestHeaders);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(async (transaction) => {
        const now = new Date();
        const windowStart = new Date(now.getTime() - windowMs);
        const cleanupBefore = new Date(now.getTime() - cleanupAgeMs);
        await transaction.publicRequestAttempt.deleteMany({ where: { updatedAt: { lt: cleanupBefore } } });

        const existing = await transaction.publicRequestAttempt.findUnique({
          where: { fingerprint_kind: { fingerprint: requestFingerprint, kind } },
          select: { attempts: true, windowStartedAt: true },
        });

        if (!existing) {
          await transaction.publicRequestAttempt.create({ data: { fingerprint: requestFingerprint, kind, windowStartedAt: now } });
          return;
        }

        if (existing.windowStartedAt <= windowStart) {
          await transaction.publicRequestAttempt.update({ where: { fingerprint_kind: { fingerprint: requestFingerprint, kind } }, data: { attempts: 1, windowStartedAt: now } });
          return;
        }

        if (existing.attempts >= maximumAttempts) {
          throw new Error("Too many requests were sent from this device. Please wait 15 minutes and try again.");
        }

        await transaction.publicRequestAttempt.update({ where: { fingerprint_kind: { fingerprint: requestFingerprint, kind } }, data: { attempts: { increment: 1 } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (retryableTransactionError(error) && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("The request could not be processed. Please try again.");
}
