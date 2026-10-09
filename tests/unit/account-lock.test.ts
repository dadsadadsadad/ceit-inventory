import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/prisma", () => ({ prisma: {} }));

import { isAccountLocked } from "@/lib/account-lock";

describe("account lock", () => {
  it("is locked only until the lock time passes", () => {
    const now = new Date("2026-10-09T08:00:00.000Z");
    expect(isAccountLocked({ lockedUntil: null }, now)).toBe(false);
    expect(isAccountLocked({ lockedUntil: new Date("2026-10-09T08:10:00.000Z") }, now)).toBe(true);
    expect(isAccountLocked({ lockedUntil: new Date("2026-10-09T07:59:59.000Z") }, now)).toBe(false);
  });
});
