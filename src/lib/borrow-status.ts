import type { BorrowStatus } from "@prisma/client";

export const borrowStatus = {
  REQUESTED: "REQUESTED",
  BORROWED: "BORROWED",
  RETURNED: "RETURNED",
  DECLINED: "DECLINED",
} as const satisfies Record<string, BorrowStatus>;

export const borrowStatuses = Object.values(borrowStatus);
