function normalizePublicUrl(value: string | undefined) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  try {
    const url = new URL(trimmedValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim();
}

function requestOrigin(requestHeaders: Headers) {
  const forwardedProtocol = firstForwardedValue(requestHeaders.get("x-forwarded-proto"))?.toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol : "http";
  const hosts = [firstForwardedValue(requestHeaders.get("x-forwarded-host")), requestHeaders.get("host")?.trim()];

  for (const host of hosts) {
    const url = normalizePublicUrl(host ? `${protocol}://${host}` : undefined);
    if (!url) continue;

    const parsedUrl = new URL(url);
    if (parsedUrl.pathname === "/") return parsedUrl.origin;
  }

  return null;
}

/**
 * Returns the public base URL embedded in inventory QR labels.
 *
 * A configured URL wins so labels remain stable behind a reverse proxy. When
 * it is absent or malformed, use the current request origin so generating a
 * label never fails solely because an environment variable was omitted.
 */
export function inventoryLabelAppUrl(configuredUrl: string | undefined, requestHeaders: Headers) {
  return normalizePublicUrl(configuredUrl) ?? requestOrigin(requestHeaders) ?? "http://localhost:3000";
}
