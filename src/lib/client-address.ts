import "server-only";

// vercel sets these headers itself so they can't be spoofed
export function clientAddress(requestHeaders: Pick<Headers, "get">) {
  const first = (name: string) => requestHeaders.get(name)?.split(",")[0]?.trim();
  return (
    first("x-vercel-forwarded-for") || first("x-forwarded-for") || first("x-real-ip") || "unknown"
  );
}

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
