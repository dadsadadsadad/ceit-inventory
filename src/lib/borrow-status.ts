import type { BorrowStatus } from "@prisma/client";

export const borrowStatus = {
  REQUESTED: "REQUESTED",
  BORROWED: "BORROWED",
  RETURN_REQUESTED: "RETURN_REQUESTED",
  RETURNED: "RETURNED",
  DECLINED: "DECLINED",
} as const satisfies Record<string, BorrowStatus>;

export const borrowStatuses = Object.values(borrowStatus);
