import type { BorrowStatus } from "@prisma/client";

export const borrowStatus = {
  REQUESTED: "REQUESTED",
  RESERVED: "RESERVED",
  BORROWED: "BORROWED",
  RETURN_REQUESTED: "RETURN_REQUESTED",
  RETURNED: "RETURNED",
  DECLINED: "DECLINED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<string, BorrowStatus>;

export const borrowStatuses = Object.values(borrowStatus);

export function borrowStatusLabel(status: BorrowStatus) {
  const labels: Record<BorrowStatus, string> = {
    REQUESTED: "Pending review", RESERVED: "Reserved", BORROWED: "Borrowed",
    RETURN_REQUESTED: "Return pending", RETURNED: "Returned", DECLINED: "Declined", CANCELLED: "Cancelled",
  };
  return labels[status];
}
