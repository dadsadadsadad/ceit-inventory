export const inventoryQrCodePattern = /^[a-z0-9_-]{8,128}$/i;

export function isInventoryQrCode(value: string) {
  return inventoryQrCodePattern.test(value);
}

function validHttpOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function inventoryQrCodeFromScan(value: string, currentOrigin: string, configuredOrigin?: string) {
  const trimmed = value.trim();
  if (isInventoryQrCode(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const trustedOrigins = new Set([validHttpOrigin(currentOrigin), validHttpOrigin(configuredOrigin)].filter((origin): origin is string => Boolean(origin)));
    if (!trustedOrigins.has(url.origin)) return "";
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "scan") return "";

    try {
      const code = decodeURIComponent(segments[1]);
      return isInventoryQrCode(code) ? code : "";
    } catch {
      return "";
    }
  } catch {
    return "";
  }
}
