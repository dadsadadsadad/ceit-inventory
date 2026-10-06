import { AuditAction } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { auditActorName, auditEventData } from "@/lib/audit-event";
import {
  auditCategory,
  auditChangedFields,
  auditTrailSearchParameters,
  auditTrailWhere,
  auditViewWhere,
  groupEventsByDay,
  parseAuditTrailFilters,
} from "@/lib/audit-trail";

describe("audit trail filters", () => {
  const now = new Date("2026-09-01T05:30:00.000Z");

  it("validates and preserves a searchable action, actor, and period", () => {
    const filters = parseAuditTrailFilters(
      new URLSearchParams({
        action: "SCANNED",
        actor: "staff@example.edu",
        period: "last-7-days",
        q: "asset-100",
      }),
      now,
    );

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
    const filters = parseAuditTrailFilters(
      new URLSearchParams({ period: "today", from: "2026-08-01", to: "2026-08-03" }),
      now,
    );

    expect(filters.dateRange.from?.toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(filters.dateRange.toExclusive?.toISOString()).toBe("2026-08-03T16:00:00.000Z");
    expect(() => parseAuditTrailFilters(new URLSearchParams({ action: "ERASED" }), now)).toThrow(
      "Invalid audit action.",
    );
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

    expect(auditCategory(event)).toBe("QR code scan");
    expect(auditChangedFields(changedEvent)).toEqual([
      { label: "Asset tag", value: "CEIT-100" },
      { label: "Quantity", value: "4" },
    ]);
  });

  it("keeps non-inventory operations searchable and identifies their subject", () => {
    const accountEvent = auditEventData({
      action: AuditAction.CREATED,
      actor: { id: "admin-id", username: "ceit.admin", email: "admin@example.edu" },
      entity: { id: "account-id", label: "ceit.staff | staff@example.edu", type: "account" },
      metadata: { activityKind: "account", role: "STAFF" },
      summary: "Account created.",
    });

    expect(
      auditActorName({ id: "staff-id", username: "ceit.staff", email: "staff@example.edu" }),
    ).toBe("ceit.staff | staff@example.edu");
    expect(accountEvent.entityLabel).toBe("ceit.staff | staff@example.edu");
    expect(
      auditCategory({
        action: accountEvent.action,
        actorId: accountEvent.actorId ?? null,
        actorName: accountEvent.actorName ?? null,
        entityId: accountEvent.entityId ?? null,
        entityLabel: accountEvent.entityLabel ?? null,
        entityType: accountEvent.entityType ?? null,
        metadata: { activityKind: "account", role: "STAFF" },
      }),
    ).toBe("Accounts");
  });
});

describe("audit trail views", () => {
  const now = new Date("2026-09-01T05:30:00.000Z");

  it("shows the important view by default and hides routine activity from it", () => {
    const filters = parseAuditTrailFilters(new URLSearchParams(), now);
    expect(filters.view).toBe("important");
    const where = auditTrailWhere(filters);
    expect(JSON.stringify(where)).toContain('"NOT"');
    expect(JSON.stringify(where)).toContain("SCANNED");
  });

  it("searches every kind of event when a specific action is chosen", () => {
    const filters = parseAuditTrailFilters(new URLSearchParams({ action: "SCANNED" }), now);
    expect(filters.view).toBe("all");
    expect(auditViewWhere("all")).toEqual({});
  });

  it("keeps the chosen view in links only when it differs from the default", () => {
    const standard = parseAuditTrailFilters(new URLSearchParams(), now);
    expect(auditTrailSearchParameters(standard).has("view")).toBe(false);
    const routine = parseAuditTrailFilters(new URLSearchParams({ view: "routine" }), now);
    expect(auditTrailSearchParameters(routine).get("view")).toBe("routine");
  });

  it("rejects an unknown view", () => {
    expect(() => parseAuditTrailFilters(new URLSearchParams({ view: "secret" }), now)).toThrow(
      "Invalid audit view.",
    );
  });

  it("scopes quick views by what the event is about", () => {
    expect(auditViewWhere("borrowing")).toEqual({ entityType: "borrow-request" });
    expect(auditViewWhere("maintenance")).toEqual({ entityType: "maintenance-ticket" });
    expect(auditViewWhere("setup")).toEqual({
      entityType: {
        in: ["account", "category", "location", "custom-field", "calendar-event", "dashboard-note"],
      },
    });
  });

  it("groups events by Philippine day with friendly headings", () => {
    const today = new Date("2026-09-01T02:00:00.000Z");
    const earlierToday = new Date("2026-08-31T17:00:00.000Z");
    const yesterday = new Date("2026-08-31T10:00:00.000Z");
    const groups = groupEventsByDay(
      [{ createdAt: today }, { createdAt: earlierToday }, { createdAt: yesterday }],
      now,
    );
    expect(groups.map((group) => [group.label, group.events.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
    ]);
  });
});
