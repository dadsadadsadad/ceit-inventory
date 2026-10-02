import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

describe("live revision database load", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ revision: "1:2026-10-02T00:00:00" }]);
  });

  afterEach(() => vi.useRealTimers());

  it("shares a slow in-flight query and starts the short cache after it finishes", async () => {
    let finish!: (result: unknown) => void;
    queryRaw.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { liveRevision } = await import("@/lib/live-revision");

    const first = liveRevision(undefined, "maintenance");
    await vi.advanceTimersByTimeAsync(3_000);
    const concurrent = liveRevision(undefined, "maintenance");
    expect(concurrent).toBe(first);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    finish([{ revision: "changed" }]);
    expect(await first).toMatch(/^[a-f0-9]{64}$/);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(liveRevision(undefined, "maintenance")).toBe(first);
    await vi.advanceTimersByTimeAsync(1_001);
    await liveRevision(undefined, "maintenance");
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("keeps public QR and staff page subscriptions separate", async () => {
    const { liveRevision } = await import("@/lib/live-revision");
    await Promise.all([
      liveRevision(undefined, "maintenance"),
      liveRevision(undefined, "users"),
      liveRevision("ceit-camera"),
      liveRevision("ceit-projector"),
    ]);

    expect(queryRaw).toHaveBeenCalledTimes(4);
    const maintenanceSql = queryRaw.mock.calls[0][0].sql as string;
    expect(maintenanceSql).toContain('"MaintenanceTicket"');
    expect(maintenanceSql).not.toContain('"User"');
    expect(maintenanceSql).not.toContain('"InventoryAudit"');
    expect(queryRaw.mock.calls[2][0].values).toContain("ceit-camera");
    expect(queryRaw.mock.calls[3][0].values).toContain("ceit-projector");
  });

  it("recovers after a failed query instead of caching the rejection", async () => {
    queryRaw.mockRejectedValueOnce(new Error("Connection interrupted"));
    const { liveRevision } = await import("@/lib/live-revision");
    await expect(liveRevision()).rejects.toThrow("Connection interrupted");
    await expect(liveRevision()).resolves.toMatch(/^[a-f0-9]{64}$/);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
