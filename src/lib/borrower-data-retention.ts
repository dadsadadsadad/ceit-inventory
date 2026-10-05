import "server-only";

import { BorrowStatus } from "@prisma/client";

import {
  borrowerDataExpiresAt as expiresAtForDays,
  borrowerDataRetentionDays,
} from "@/lib/borrower-retention-policy";
import { prisma } from "@/prisma";

export function borrowerDataExpiresAt(now = new Date()) {
  return expiresAtForDays(now, borrowerDataRetentionDays(process.env.BORROWER_DATA_RETENTION_DAYS));
}

const purgeIntervalMs = 6 * 60 * 60 * 1000;
let lastPurgeStartedAt = 0;

// Remove personal details after closed requests expire.
export async function purgeExpiredBorrowerData(now = new Date()) {
  return prisma.borrowRequest.updateMany({
    where: {
      status: { in: [BorrowStatus.RETURNED, BorrowStatus.DECLINED, BorrowStatus.CANCELLED] },
      personalDataExpiresAt: { lte: now },
      studentNumber: { not: "REDACTED" },
    },
    data: {
      borrowerName: "Archived borrower",
      studentNumber: "REDACTED",
      contact: "REDACTED",
      purpose: "Archived borrowing history",
      returnRequestNotes: null,
      staffNotes: null,
    },
  });
}

/**
 * Redact expired borrower details without an external scheduler, which hosting such as Vercel
 * does not provide. It is a single indexed update, so running it from time to time while staff
 * use the dashboard is cheap, and repeating it is harmless.
 */
export async function purgeExpiredBorrowerDataIfDue(now = new Date()) {
  if (now.getTime() - lastPurgeStartedAt < purgeIntervalMs) {
    return;
  }
  lastPurgeStartedAt = now.getTime();
  try {
    await purgeExpiredBorrowerData(now);
  } catch (error) {
    // Try again on a later visit; the dashboard itself must not depend on this.
    lastPurgeStartedAt = 0;
    console.error("Unable to redact expired borrower details", error);
  }
}
