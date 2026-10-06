import { beforeEach, describe, expect, it, vi } from "vitest";

const { database, requestHeaders } = vi.hoisted(() => {
  const attempts = {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const database = {
    publicRequestAttempt: attempts,
    $transaction: vi.fn(async (work: (client: unknown) => unknown) =>
      work({ publicRequestAttempt: attempts }),
    ),
  };
  return { database, requestHeaders: { current: new Headers() } };
});

vi.mock("server-only", () => ({}));
vi.mock("@/prisma", () => ({ prisma: database }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));

import {
  isSignInThrottled,
  maximumFailedSignIns,
  recordFailedSignInAttempt,
} from "@/lib/sign-in-throttle";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("limiting failed sign-ins from one device", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    database.$transaction.mockImplementation(async (work: (client: unknown) => unknown) =>
      work({ publicRequestAttempt: database.publicRequestAttempt }),
    );
    vi.stubEnv("REQUEST_RATE_LIMIT_SECRET", "a-secret-for-tests");
    requestHeaders.current = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
  });

  it("does not limit a device that has not failed", async () => {
    database.publicRequestAttempt.findUnique.mockResolvedValue(null);
    expect(await isSignInThrottled()).toBe(false);
  });

  it("limits a device once it has used up its failures in the window", async () => {
    database.publicRequestAttempt.findUnique.mockResolvedValue({
      attempts: maximumFailedSignIns,
      windowStartedAt: minutesAgo(5),
    });
    expect(await isSignInThrottled()).toBe(true);
    database.publicRequestAttempt.findUnique.mockResolvedValue({
      attempts: maximumFailedSignIns - 1,
      windowStartedAt: minutesAgo(5),
    });
    expect(await isSignInThrottled()).toBe(false);
  });

  it("forgets old failures once the window has passed", async () => {
    database.publicRequestAttempt.findUnique.mockResolvedValue({
      attempts: 500,
      windowStartedAt: minutesAgo(20),
    });
    expect(await isSignInThrottled()).toBe(false);
  });

  it("counts a first failure, adds to a running count, and starts over after the window", async () => {
    database.publicRequestAttempt.findUnique.mockResolvedValueOnce(null);
    await recordFailedSignInAttempt();
    expect(database.publicRequestAttempt.create).toHaveBeenCalledTimes(1);

    database.publicRequestAttempt.findUnique.mockResolvedValueOnce({
      windowStartedAt: minutesAgo(3),
    });
    await recordFailedSignInAttempt();
    expect(database.publicRequestAttempt.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );

    database.publicRequestAttempt.findUnique.mockResolvedValueOnce({
      windowStartedAt: minutesAgo(30),
    });
    await recordFailedSignInAttempt();
    expect(database.publicRequestAttempt.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: 1 }) }),
    );
  });

  it("tells devices apart by network address alone, not by browser name", async () => {
    database.publicRequestAttempt.findUnique.mockResolvedValue(null);
    const keys: string[] = [];
    database.publicRequestAttempt.findUnique.mockImplementation(
      async ({ where }: { where: { fingerprint_kind: { fingerprint: string } } }) => {
        keys.push(where.fingerprint_kind.fingerprint);
        return null;
      },
    );
    requestHeaders.current = new Headers({
      "x-forwarded-for": "198.51.100.4",
      "user-agent": "one",
    });
    await isSignInThrottled();
    requestHeaders.current = new Headers({
      "x-forwarded-for": "198.51.100.4",
      "user-agent": "two",
    });
    await isSignInThrottled();
    requestHeaders.current = new Headers({
      "x-forwarded-for": "198.51.100.5",
      "user-agent": "one",
    });
    await isSignInThrottled();
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
    // The stored value is a hash, never the address itself.
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never lets a failure to record a failure stop the sign-in page", async () => {
    database.$transaction.mockRejectedValue(new Error("database is down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recordFailedSignInAttempt()).resolves.toBeUndefined();
  });
});
