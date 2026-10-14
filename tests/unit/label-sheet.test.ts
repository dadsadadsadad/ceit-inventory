import { expect, it } from "vitest";
import { labelLayoutOf, labelLayouts, labelPages, selectedLabelIds } from "@/lib/label-sheet";
it("keeps each label exactly once across complete and partial sheets", () => {
  const items = Array.from({ length: 27 }, (_, index) => index);
  const pages = labelPages(items, 24);
  expect(pages.map((page) => page.length)).toEqual([24, 3]);
  expect(pages.flat()).toEqual(items);
  expect(labelPages([], 8)).toEqual([]);
});

it("knows every label size and falls back to medium", () => {
  expect(labelLayoutOf("small")).toBe("small");
  expect(labelLayoutOf("poster")).toBe("poster");
  expect(labelLayoutOf("large")).toBe("large");
  expect(labelLayoutOf("toString")).toBe("compact");
  expect(labelLayoutOf(undefined)).toBe("compact");
  expect(Object.values(labelLayouts).map((layout) => layout.perPage)).toEqual([40, 24, 8, 2]);
});

it("reads chosen items from a link or from ticked boxes, once each", () => {
  expect(selectedLabelIds("a,b,,a")).toEqual(["a", "b"]);
  expect(selectedLabelIds(["a", "b,c", "c"])).toEqual(["a", "b", "c"]);
  expect(selectedLabelIds(undefined)).toEqual([]);
});
