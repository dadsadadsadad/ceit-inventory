import { describe, expect, it } from "vitest";

import { inventoryLabelAppUrl } from "@/lib/inventory-label-url";

describe("inventory label URLs", () => {
  it("uses a configured HTTP URL for an on-premise deployment", () => {
    expect(inventoryLabelAppUrl("http://192.168.18.3:3000", new Headers({ host: "ignored.example" }))).toBe("http://192.168.18.3:3000");
  });

  it("uses the proxy-facing request origin when no URL is configured", () => {
    expect(inventoryLabelAppUrl(undefined, new Headers({
      host: "internal.example:3000",
      "x-forwarded-host": "inventory.example.edu",
      "x-forwarded-proto": "https",
    }))).toBe("https://inventory.example.edu");
  });

  it("falls back to the request origin when the configured URL is malformed", () => {
    expect(inventoryLabelAppUrl("not a URL", new Headers({ host: "192.168.18.3:3000" }))).toBe("http://192.168.18.3:3000");
  });

  it("ignores an invalid forwarded host in favor of the direct host", () => {
    expect(inventoryLabelAppUrl(undefined, new Headers({
      host: "inventory.example.edu",
      "x-forwarded-host": "not-a-host/path",
      "x-forwarded-proto": "https",
    }))).toBe("https://inventory.example.edu");
  });
});
