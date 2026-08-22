export const inventoryQrCodePattern = /^[a-z0-9_-]{8,128}$/i;

export function isInventoryQrCode(value: string) {
  return inventoryQrCodePattern.test(value);
}

export function inventoryQrCodeFromScan(value: string, currentOrigin: string, configuredOrigin?: string) {
  const trimmed = value.trim();
  if (isInventoryQrCode(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const trustedOrigins = new Set([currentOrigin, configuredOrigin].filter(Boolean));
    if (!trustedOrigins.has(url.origin)) return "";
    const segments = url.pathname.split("/").filter(Boolean);
    const code = segments.length === 2 && segments[0] === "scan" ? decodeURIComponent(segments[1]) : "";
    return isInventoryQrCode(code) ? code : "";
  } catch {
    return "";
  }
}
