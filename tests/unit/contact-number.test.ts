import { describe, expect, it } from "vitest";
import { normalizeContactNumber } from "@/lib/contact-number";

describe("contact number matching", () => {
  it("matches local and international Philippine mobile formatting", () => {
    for (const input of ["0912 345 6789", "(0912) 345-6789", "+63 912 345 6789"]) {
      expect(normalizeContactNumber(input)).toBe("09123456789");
    }
  });
  it("preserves other country and landline numbers", () => {
    expect(normalizeContactNumber("+1 (415) 555-0123")).toBe("14155550123");
    expect(normalizeContactNumber("555-0123")).toBe("5550123");
  });
  it("rejects punctuation-only input and implausible lengths", () => {
    for (const input of [
      "-------",
      "123-456",
      "0912hello345",
      "09+123456789",
      "1234567890123456",
    ]) {
      expect(normalizeContactNumber(input)).toBeNull();
    }
  });
});
