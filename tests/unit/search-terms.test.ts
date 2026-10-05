import { describe, expect, it } from "vitest";

import { everyTermMatches, searchTerms } from "@/lib/search-terms";

describe("search terms", () => {
  it("splits on any whitespace and ignores empty input", () => {
    expect(searchTerms("  dell \t lab\n2 ")).toEqual(["dell", "lab", "2"]);
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms(null)).toEqual([]);
  });

  it("limits the number and length of terms", () => {
    expect(searchTerms("a b c d e f g h")).toHaveLength(6);
    expect(searchTerms("x".repeat(200))[0]).toHaveLength(80);
  });

  it("requires every term to match one of the fields", () => {
    expect(everyTermMatches(["dell", "lab"], (term) => [`name:${term}`, `room:${term}`])).toEqual([
      { OR: ["name:dell", "room:dell"] },
      { OR: ["name:lab", "room:lab"] },
    ]);
    expect(everyTermMatches([], () => ["unused"])).toEqual([]);
  });
});
