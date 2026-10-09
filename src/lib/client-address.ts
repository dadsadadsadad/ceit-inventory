import "server-only";

/**
 * The visitor's network address, for rate limits. On Vercel these headers are set by the
 * platform itself, so a visitor cannot pretend to be somewhere else by sending their own.
 */
export function clientAddress(requestHeaders: Pick<Headers, "get">) {
  const first = (name: string) => requestHeaders.get(name)?.split(",")[0]?.trim();
  return (
    first("x-vercel-forwarded-for") || first("x-forwarded-for") || first("x-real-ip") || "unknown"
  );
}

/** The key that turns addresses into anonymous rate-limit fingerprints. */
export function rateLimitSecret() {
  const secret =
    process.env.REQUEST_RATE_LIMIT_SECRET ??
    process.env.SCHOOL_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!secret) {
    throw new Error("Request protection is not configured.");
  }
  return secret;
}
