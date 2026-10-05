import { describe, expect, it } from "vitest";

import { paginationEntries } from "@/lib/pagination";
import { firstParam, pageParam, textParam } from "@/lib/search-params";
import { isUuid } from "@/lib/ids";

describe("pager entries", () => {
  it("lists every page when there are few", () => {
    expect(paginationEntries(1, 1)).toEqual([1]);
    expect(paginationEntries(5, 3)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationEntries(9, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("marks gaps around the current page when there are many", () => {
    expect(paginationEntries(20, 1)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(paginationEntries(20, 10)).toEqual([1, null, 8, 9, 10, 11, 12, null, 20]);
    expect(paginationEntries(20, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
  });
});

describe("query-string helpers", () => {
  it("uses the first of repeated values", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });

  it("clamps page numbers and ignores nonsense", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("-4")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam("999999")).toBe(10_000);
    expect(pageParam(["2", "9"])).toBe(2);
  });

  it("trims and limits search text", () => {
    expect(textParam("  desk  ")).toBe("desk");
    expect(textParam("x".repeat(500))).toHaveLength(120);
    expect(textParam(undefined)).toBe("");
  });
});

describe("record ids", () => {
  it("accepts UUIDs and rejects everything else", () => {
    expect(isUuid("3f2c1b8e-9a4d-4c61-8b2e-1d7a5f0c9e34")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
