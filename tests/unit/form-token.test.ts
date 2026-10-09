import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertFormToken, issueFormToken } from "@/lib/form-token";

describe("signed public form tokens", () => {
  beforeEach(() => {
    vi.stubEnv("REQUEST_RATE_LIMIT_SECRET", "test-secret-value");
  });

  const issuedAt = 1_800_000_000_000;

  it("accepts a token from a form that was open for a normal amount of time", () => {
    const token = issueFormToken("borrow:abc", issuedAt);
    expect(() => assertFormToken("borrow:abc", token, issuedAt + 5_000)).not.toThrow();
  });

  it("refuses a missing, malformed, or forged token", () => {
    expect(() => assertFormToken("borrow:abc", "", issuedAt)).toThrow(/could not be verified/);
    expect(() => assertFormToken("borrow:abc", "nonsense", issuedAt)).toThrow(
      /could not be verified/,
    );
    const token = issueFormToken("borrow:abc", issuedAt);
    const [time] = token.split(".");
    expect(() =>
      assertFormToken("borrow:abc", `${time}.${"0".repeat(64)}`, issuedAt + 5_000),
    ).toThrow(/could not be verified/);
    // As many characters as a real signature, but more bytes: refused, not a crash.
    expect(() =>
      assertFormToken("borrow:abc", `${time}.${"é".repeat(64)}`, issuedAt + 5_000),
    ).toThrow(/could not be verified/);
  });

  it("will not let a token be used for another item or another kind of form", () => {
    const token = issueFormToken("borrow:abc", issuedAt);
    expect(() => assertFormToken("borrow:other", token, issuedAt + 5_000)).toThrow(
      /could not be verified/,
    );
    expect(() => assertFormToken("issue:abc", token, issuedAt + 5_000)).toThrow(
      /could not be verified/,
    );
  });

  it("refuses a submission too fast to have been typed, and a page left open for hours", () => {
    const token = issueFormToken("issue:abc", issuedAt);
    expect(() => assertFormToken("issue:abc", token, issuedAt + 100)).toThrow(/very quick/);
    expect(() => assertFormToken("issue:abc", token, issuedAt + 7 * 60 * 60 * 1000)).toThrow(
      /open for a long time/,
    );
  });
});
