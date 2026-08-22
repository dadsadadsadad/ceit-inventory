import "server-only";

import { BorrowStatus } from "@prisma/client";

import { borrowerDataExpiresAt as expiresAtForDays, borrowerDataRetentionDays } from "@/lib/borrower-retention-policy";
import { prisma } from "@/prisma";

export function borrowerDataExpiresAt(now = new Date()) {
  return expiresAtForDays(now, borrowerDataRetentionDays(process.env.BORROWER_DATA_RETENTION_DAYS));
}

export async function purgeExpiredBorrowerData(now = new Date()) {
  return prisma.borrowRequest.updateMany({
    where: {
      status: { in: [BorrowStatus.RETURNED, BorrowStatus.DECLINED] },
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
