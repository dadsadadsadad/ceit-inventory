import { describe, expect, it } from "vitest";

import { inventoryLabelAppOrigin, inventoryLabelAppUrl } from "@/lib/inventory-label-url";

describe("inventory label URLs", () => {
  it("uses a configured HTTP URL for an on-premise deployment", () => {
    expect(inventoryLabelAppUrl("http://192.168.18.3:3000", new Headers({ host: "ignored.example" }))).toBe("http://192.168.18.3:3000");
  });

  it("uses a safe localhost or LAN request origin when no URL is configured", () => {
    expect(inventoryLabelAppUrl(undefined, new Headers({
      host: "192.168.18.3:3000",
      "x-forwarded-proto": "http",
    }))).toBe("http://192.168.18.3:3000");
  });

  it("does not use a Vercel or arbitrary public request host when no canonical URL is configured", () => {
    expect(inventoryLabelAppUrl(undefined, new Headers({
      host: "internal.example:3000",
      "x-forwarded-host": "ceit-inventory-git-main-team.vercel.app",
      "x-forwarded-proto": "https",
    }))).toBeNull();
    expect(inventoryLabelAppUrl("not a URL", new Headers({ host: "inventory.example.edu" }))).toBeNull();
  });

  it("ignores an invalid forwarded host in favor of a local direct host", () => {
    expect(inventoryLabelAppUrl(undefined, new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "not-a-host/path",
      "x-forwarded-proto": "https",
    }))).toBe("https://localhost:3000");
  });

  it("provides a guarded configured origin for the in-app scanner", () => {
    expect(inventoryLabelAppOrigin("https://inventory.example.edu/ceit")).toBe("https://inventory.example.edu");
    expect(inventoryLabelAppOrigin("not a URL")).toBeUndefined();
  });
});
