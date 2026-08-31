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

function isLocalOrPrivateHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost") || normalizedHostname.endsWith(".local") || normalizedHostname === "::1") {
    return true;
  }

  const octets = normalizedHostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim();
}

function localRequestOrigin(requestHeaders: Headers) {
  const forwardedProtocol = firstForwardedValue(requestHeaders.get("x-forwarded-proto"))?.toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol : "http";
  const hosts = [firstForwardedValue(requestHeaders.get("x-forwarded-host")), requestHeaders.get("host")?.trim()];

  for (const host of hosts) {
    const url = normalizePublicUrl(host ? `${protocol}://${host}` : undefined);
    if (!url) continue;

    const parsedUrl = new URL(url);
    if (parsedUrl.pathname === "/" && isLocalOrPrivateHostname(parsedUrl.hostname)) return parsedUrl.origin;
  }

  return null;
}

/**
 * Returns the trusted origin used by the in-app scanner when it reads a full
 * QR URL. Invalid configuration is ignored instead of breaking the scanner.
 */
export function inventoryLabelAppOrigin(configuredUrl: string | undefined) {
  const url = normalizePublicUrl(configuredUrl);
  return url ? new URL(url).origin : undefined;
}

/**
 * Returns the public base URL embedded in inventory QR labels.
 *
 * A configured URL is required for public deployments. Request headers can be
 * controlled by proxies (or point to a protected preview deployment), so they
 * are only used as a convenience for localhost and private-LAN development.
 */
export function inventoryLabelAppUrl(configuredUrl: string | undefined, requestHeaders: Headers) {
  return normalizePublicUrl(configuredUrl) ?? localRequestOrigin(requestHeaders);
}
