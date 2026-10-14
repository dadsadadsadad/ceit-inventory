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

// vercel has no cron, so this runs now and then when the dashboard loads
export async function purgeExpiredBorrowerDataIfDue(now = new Date()) {
  if (now.getTime() - lastPurgeStartedAt < purgeIntervalMs) {
    return;
  }
  lastPurgeStartedAt = now.getTime();
  try {
    await purgeExpiredBorrowerData(now);
  } catch (error) {
    // ignore, it'll run next time
    lastPurgeStartedAt = 0;
    console.error("Unable to redact expired borrower details", error);
  }
}
