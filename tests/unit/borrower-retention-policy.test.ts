import { describe, expect, it } from "vitest";

import { borrowerDataExpiresAt, borrowerDataRetentionDays } from "@/lib/borrower-retention-policy";

describe("borrower data retention", () => {
  it("uses one year by default and rejects unsafe configuration", () => {
    expect(borrowerDataRetentionDays()).toBe(365);
    expect(borrowerDataRetentionDays("not-a-number")).toBe(365);
    expect(borrowerDataRetentionDays("29")).toBe(365);
  });

  it("allows a bounded school policy", () => {
    expect(borrowerDataRetentionDays("180")).toBe(180);
    expect(borrowerDataExpiresAt(new Date("2026-01-01T00:00:00.000Z"), 180).toISOString()).toBe("2026-06-30T00:00:00.000Z");
  });
});
