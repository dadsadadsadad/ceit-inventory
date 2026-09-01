import { AuditAction } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { auditCategory, auditChangedFields, auditTrailWhere, parseAuditTrailFilters } from "@/lib/audit-trail";

describe("audit trail filters", () => {
  const now = new Date("2026-09-01T05:30:00.000Z");

  it("validates and preserves a searchable action, actor, and period", () => {
    const filters = parseAuditTrailFilters(new URLSearchParams({ action: "SCANNED", actor: "staff@example.edu", period: "last-7-days", q: "asset-100" }), now);

    expect(filters.action).toBe(AuditAction.SCANNED);
    expect(filters.actor).toBe("staff@example.edu");
    expect(filters.query).toBe("asset-100");
    expect(filters.dateRange.from?.toISOString()).toBe("2026-08-25T16:00:00.000Z");
    expect(auditTrailWhere(filters)).toMatchObject({
      AND: expect.arrayContaining([
        { action: AuditAction.SCANNED },
        { actorName: { contains: "staff@example.edu", mode: "insensitive" } },
        { OR: expect.any(Array) },
      ]),
    });
  });

  it("uses custom dates ahead of a preset and rejects unknown actions", () => {
    const filters = parseAuditTrailFilters(new URLSearchParams({ period: "today", from: "2026-08-01", to: "2026-08-03" }), now);

    expect(filters.dateRange.from?.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(filters.dateRange.toExclusive?.toISOString()).toBe("2026-08-03T16:00:00.000Z");
    expect(() => parseAuditTrailFilters(new URLSearchParams({ action: "ERASED" }), now)).toThrow("Invalid audit action.");
  });

  it("labels public scans and shows captured field values", () => {
    const event = {
      action: AuditAction.SCANNED,
      actorId: null,
      actorName: null,
      metadata: { scanType: "public", source: "qr" },
    };
    const changedEvent = {
      action: AuditAction.UPDATED,
      actorId: "staff-id",
      actorName: "staff@example.edu",
      metadata: { changes: { assetTag: "CEIT-100", quantity: 4 } },
    };

    expect(auditCategory(event)).toBe("QR scan");
    expect(auditChangedFields(changedEvent)).toEqual([
      { label: "Asset tag", value: "CEIT-100" },
      { label: "Quantity", value: "4" },
    ]);
  });
});
