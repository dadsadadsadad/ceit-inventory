import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, revision } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  revision: vi.fn(),
}));

vi.mock("@/lib/inventory-auth", () => ({ getCurrentInventoryUser: currentUser }));
vi.mock("@/lib/live-revision", () => ({ liveRevision: revision }));

import { GET } from "@/app/api/live/route";
import { isLiveUpdateScope, liveUpdateScope } from "@/lib/live-update-scope";

describe("live subscriptions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    currentUser.mockReset().mockResolvedValue({ id: "staff", role: "staff" });
    revision.mockReset().mockResolvedValue("opaque-revision");
  });

  afterEach(() => vi.useRealTimers());

  it("rejects invalid scopes and unauthenticated staff subscriptions", async () => {
    const invalid = await GET(new Request("http://localhost/api/live?scope=constructor"));
    expect(invalid.status).toBe(400);
    currentUser.mockResolvedValue(null);
    const privateResponse = await GET(
      new Request("http://localhost/api/live?scope=users&mode=poll"),
    );
    expect(privateResponse.status).toBe(401);
    expect(revision).not.toHaveBeenCalled();
  });

  it("rechecks a revoked staff session during an open stream", async () => {
    const response = await GET(new Request("http://localhost/api/live?scope=maintenance"));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain("retry:");
    expect(decoder.decode((await reader.read()).value)).toContain("opaque-revision");
    expect(currentUser).toHaveBeenCalledTimes(1);

    currentUser.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(decoder.decode((await reader.read()).value)).toContain("event: expired");
    expect((await reader.read()).done).toBe(true);
    expect(revision).toHaveBeenCalledTimes(1);
    expect(currentUser).toHaveBeenCalledTimes(2);
  });

  it("maps editing pages to their data without treating unrelated URLs as dashboards", () => {
    expect(liveUpdateScope("/dashboard/inventory/new")).toBe("setup");
    expect(liveUpdateScope("/dashboard/inventory/import")).toBe("setup");
    expect(liveUpdateScope("/dashboard/inventory/abc123")).toBe("item");
    expect(liveUpdateScope("/dashboard/borrowing")).toBe("borrowing");
    expect(liveUpdateScope("/dashboard-other")).toBeNull();
    expect(liveUpdateScope("/dashboard/unknown")).toBeNull();
    expect(isLiveUpdateScope("__proto__")).toBe(false);
  });
});
