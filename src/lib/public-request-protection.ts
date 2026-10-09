import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { Prisma, PublicRequestKind } from "@prisma/client";

import { prisma } from "@/prisma";
import { clientAddress, rateLimitSecret } from "./client-address";
import { FormError } from "./form-action";

/**
 * Two limits on public forms. One device gets a handful of submissions; a whole network (one
 * address) gets more, because a classroom on the campus Wi-Fi shares one address, but not
 * unlimited, because a script can change its browser name as often as it likes.
 */
const maximumDeviceAttempts = 8;
const maximumNetworkAttempts = 60;
const windowMs = 15 * 60 * 1000;
const cleanupAgeMs = 24 * 60 * 60 * 1000;

// Anonymous fingerprints for this device and its network.
function fingerprints(kind: PublicRequestKind, requestHeaders: Headers) {
  const address = clientAddress(requestHeaders);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) || "unknown";
  const hash = (value: string) =>
    createHmac("sha256", rateLimitSecret()).update(value).digest("hex");
  return [
    { fingerprint: hash(`${kind}:${address}:${userAgent}`), limit: maximumDeviceAttempts },
    { fingerprint: hash(`${kind}:network:${address}`), limit: maximumNetworkAttempts },
  ];
}

function retryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

// Limit repeated public submissions within the request window.
export async function enforcePublicRequestRateLimit(kind: PublicRequestKind) {
  const requestHeaders = await headers();
  const sources = fingerprints(kind, requestHeaders);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(
        async (transaction) => {
          const now = new Date();
          const windowStart = new Date(now.getTime() - windowMs);
          const cleanupBefore = new Date(now.getTime() - cleanupAgeMs);
          await transaction.publicRequestAttempt.deleteMany({
            where: { updatedAt: { lt: cleanupBefore } },
          });

          for (const { fingerprint, limit } of sources) {
            const key = { fingerprint_kind: { fingerprint, kind } };
            const existing = await transaction.publicRequestAttempt.findUnique({
              where: key,
              select: { attempts: true, windowStartedAt: true },
            });
            if (!existing) {
              await transaction.publicRequestAttempt.create({
                data: { fingerprint, kind, windowStartedAt: now },
              });
            } else if (existing.windowStartedAt <= windowStart) {
              await transaction.publicRequestAttempt.update({
                where: key,
                data: { attempts: 1, windowStartedAt: now },
              });
            } else if (existing.attempts >= limit) {
              throw new FormError(
                "Too many requests were sent from this device. Please wait 15 minutes and try again.",
              );
            } else {
              await transaction.publicRequestAttempt.update({
                where: key,
                data: { attempts: { increment: 1 } },
              });
            }
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return;
    } catch (error) {
      if (retryableTransactionError(error) && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("The request could not be processed. Please try again.");
}
