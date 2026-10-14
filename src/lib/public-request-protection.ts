import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { Prisma, PublicRequestKind } from "@prisma/client";

import { prisma } from "@/prisma";
import { clientAddress, rateLimitSecret } from "./client-address";
import { FormError } from "./form-action";

// per device limit and a bigger per network limit (classrooms share one ip)
const maxDeviceAttempts = 8;
const maxNetworkAttempts = 60;
const windowMs = 15 * 60 * 1000;
const cleanupAgeMs = 24 * 60 * 60 * 1000;

function fingerprints(kind: PublicRequestKind, requestHeaders: Headers) {
  const address = clientAddress(requestHeaders);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) || "unknown";
  const hash = (value: string) =>
    createHmac("sha256", rateLimitSecret()).update(value).digest("hex");
  return [
    { fingerprint: hash(`${kind}:${address}:${userAgent}`), limit: maxDeviceAttempts },
    { fingerprint: hash(`${kind}:network:${address}`), limit: maxNetworkAttempts },
  ];
}

function retryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export async function enforcePublicRequestRateLimit(kind: PublicRequestKind) {
  const requestHeaders = await headers();
  const sources = fingerprints(kind, requestHeaders);

  // P2002 happens when two requests create the same row at once, just retry
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const windowStart = new Date(now.getTime() - windowMs);
          const cleanupBefore = new Date(now.getTime() - cleanupAgeMs);
          await tx.publicRequestAttempt.deleteMany({
            where: { updatedAt: { lt: cleanupBefore } },
          });

          for (const { fingerprint, limit } of sources) {
            const key = { fingerprint_kind: { fingerprint, kind } };
            const existing = await tx.publicRequestAttempt.findUnique({
              where: key,
              select: { attempts: true, windowStartedAt: true },
            });
            if (!existing) {
              await tx.publicRequestAttempt.create({
                data: { fingerprint, kind, windowStartedAt: now },
              });
              // window expired, start a new one
            } else if (existing.windowStartedAt <= windowStart) {
              await tx.publicRequestAttempt.update({
                where: key,
                data: { attempts: 1, windowStartedAt: now },
              });
            } else if (existing.attempts >= limit) {
              throw new FormError(
                "Too many requests were sent from this device. Please wait 15 minutes and try again.",
              );
            } else {
              await tx.publicRequestAttempt.update({
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
