import { expect, it } from "vitest";
import { labelPages } from "@/lib/label-sheet";
it("keeps each label exactly once across complete and partial sheets", () => {
  const items = Array.from({ length: 27 }, (_, index) => index);
  const pages = labelPages(items, 24);
  expect(pages.map((page) => page.length)).toEqual([24, 3]);
  expect(pages.flat()).toEqual(items);
  expect(labelPages([], 8)).toEqual([]);
});
