import { describe, expect, it } from "vitest";

import { stripControlCharacters } from "@/lib/clean-text";
import { firstParam, textParam } from "@/lib/search-params";
import { searchTerms } from "@/lib/search-terms";

describe("control characters in text", () => {
  it("removes null bytes and other control characters", () => {
    expect(stripControlCharacters("a\u0000b")).toBe("ab");
    expect(stripControlCharacters("\u0001\u0002name\u007f")).toBe("name");
    expect(stripControlCharacters("bell\u0007")).toBe("bell");
  });

  it("keeps tabs, line breaks, and everything people actually type", () => {
    expect(stripControlCharacters("line one\nline two\r\n\tindented")).toBe(
      "line one\nline two\r\n\tindented",
    );
    expect(stripControlCharacters("Café ñ 日本語 😀 ₱1,200")).toBe("Café ñ 日本語 😀 ₱1,200");
  });

  it("cleans what arrives in an address, so a page's query cannot be broken by it", () => {
    expect(firstParam("a\u0000b")).toBe("ab");
    expect(firstParam(["x\u0000", "second"])).toBe("x");
    expect(firstParam(undefined)).toBeUndefined();
    expect(textParam("  \u0000dell\u0000  ")).toBe("dell");
  });

  it("cleans search words", () => {
    expect(searchTerms("dell\u0000 lab\u0000")).toEqual(["dell", "lab"]);
    expect(searchTerms("\u0000")).toEqual([]);
  });
});
