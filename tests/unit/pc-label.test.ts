import { expect, it } from "vitest";
import { pcHardwareRows, pcLabelLayout, pcLabelSizeOf } from "@/lib/pc-label";

const pc = {
  assetTag: "CEIT-0009",
  manufacturer: "Lenovo",
  model: null,
  name: "CEIT-MAC09",
  serialNumber: null,
  location: { name: "Mac Lab" },
  computer: {
    graphics: null,
    hardwareDescription: "Board: H610M\n PSU: 500W",
    ipAddress: null,
    macAddress: null,
    memoryGb: 16,
    operatingSystem: "Windows 11",
    osVersion: "23H2",
    processor: "Intel Core i5-12400",
    storageGb: 512,
    storageType: "SSD",
  },
};

it("lists recorded hardware and skips empty parts", () => {
  expect(pcHardwareRows(pc)).toEqual([
    ["PC name", "CEIT-MAC09"],
    ["Room", "Mac Lab"],
    ["Brand", "Lenovo"],
    ["CPU", "Intel Core i5-12400"],
    ["RAM", "16 GB"],
    ["Storage", "512 GB SSD"],
    ["OS", "Windows 11 23H2"],
    ["Other", "Board: H610M PSU: 500W"],
  ]);
  expect(pcHardwareRows({ ...pc, manufacturer: null, computer: null })).toEqual([
    ["PC name", "CEIT-MAC09"],
    ["Room", "Mac Lab"],
  ]);
});

it("grows with the software list and splits long ones into two columns", () => {
  expect(pcLabelLayout(8, 0)).toEqual({ rows: 8, softwareColumns: 1 });
  expect(pcLabelLayout(8, 12)).toEqual({ rows: 12, softwareColumns: 1 });
  expect(pcLabelLayout(8, 14)).toEqual({ rows: 14, softwareColumns: 1 });
  expect(pcLabelLayout(8, 15)).toEqual({ rows: 8, softwareColumns: 2 });
  expect(pcLabelLayout(8, 30)).toEqual({ rows: 15, softwareColumns: 2 });
});

it("falls back to the standard size", () => {
  expect(pcLabelSizeOf("small")).toBe("small");
  expect(pcLabelSizeOf("large")).toBe("large");
  expect(pcLabelSizeOf("toString")).toBe("standard");
  expect(pcLabelSizeOf(undefined)).toBe("standard");
});
