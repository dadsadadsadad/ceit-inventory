import type { Prisma } from "@prisma/client";

import { auditViewWhere } from "@/lib/audit-trail";

export const itemRecordInclude = {
  category: true,
  location: true,
  computer: { include: { software: { orderBy: { name: "asc" } } } },
  photos: {
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, byteSize: true, createdAt: true },
  },
  // skip scans and label prints, they'd push out the real changes
  auditEvents: { where: auditViewWhere("important"), orderBy: { createdAt: "desc" }, take: 12 },
  borrowRequests: {
    where: { status: { in: ["REQUESTED", "RESERVED", "BORROWED", "RETURN_REQUESTED"] } },
    orderBy: { startsAt: "asc" },
    take: 10,
  },
  maintenanceTickets: { where: { status: "OPEN" }, orderBy: { openedAt: "desc" }, take: 10 },
} satisfies Prisma.InventoryItemInclude;

export type ItemRecord = Prisma.InventoryItemGetPayload<{ include: typeof itemRecordInclude }>;
