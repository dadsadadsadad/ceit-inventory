import { describe, expect, it } from "vitest";

import {
  componentValue,
  groupHardware,
  groupSoftware,
  isIncompleteProfile,
  licenseState,
  sortSoftwareGroups,
  type DirectoryComputer,
  type SoftwareEntry,
} from "@/lib/computer-directory";

const now = new Date("2026-10-06T00:00:00Z");
const days = (value: number) => new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
const pc = (name: string, room = "Lab 1") => ({ id: name, name, assetTag: null, room });

const entry = (
  name: string,
  computer: string,
  extra: Partial<SoftwareEntry> = {},
): SoftwareEntry => ({
  name,
  version: null,
  licenseKeyHint: null,
  licenseExpiresAt: null,
  isLicensed: null,
  installedAt: null,
  pc: pc(computer),
  ...extra,
});

describe("license state", () => {
  it("classifies expired, expiring soon, current, and undated licenses", () => {
    expect(licenseState(days(-1), now)).toBe("expired");
    expect(licenseState(days(10), now)).toBe("expiring");
    expect(licenseState(days(30), now)).toBe("expiring");
    expect(licenseState(days(31), now)).toBe("valid");
    expect(licenseState(null, now)).toBe("none");
  });
});

describe("software groups", () => {
  it("groups titles regardless of capitalization and counts every PC", () => {
    const groups = groupSoftware(
      [
        entry("Visual Studio Code", "PC-01", { version: "1.95" }),
        entry("visual studio code", "PC-02", { version: "1.95" }),
        entry("Visual Studio Code ", "PC-03", { version: "1.90" }),
        entry("Blender", "PC-01"),
      ],
      now,
    );
    expect(groups).toHaveLength(2);
    const code = groups.find((group) => group.name.toLowerCase().startsWith("visual"))!;
    expect(code.installs).toHaveLength(3);
    expect(code.versions).toEqual([
      { version: "1.95", count: 2 },
      { version: "1.90", count: 1 },
    ]);
    expect(groups.find((group) => group.name === "Blender")!.versions).toEqual([
      { version: "Not recorded", count: 1 },
    ]);
  });

  it("reports the most urgent license state and the soonest expiry", () => {
    const [group] = groupSoftware(
      [
        entry("Photoshop", "PC-01", { licenseExpiresAt: days(200) }),
        entry("Photoshop", "PC-02", { licenseExpiresAt: days(5) }),
        entry("Photoshop", "PC-03"),
      ],
      now,
    );
    expect(group.state).toBe("expiring");
    expect(group.soonestExpiry?.getTime()).toBe(days(5).getTime());
  });

  it("sorts by name, installations, or soonest expiry", () => {
    const groups = groupSoftware(
      [
        entry("Zoom", "PC-01"),
        entry("Zoom", "PC-02"),
        entry("Alpha", "PC-01", { licenseExpiresAt: days(40) }),
        entry("Mid", "PC-01", { licenseExpiresAt: days(3) }),
      ],
      now,
    );
    expect(sortSoftwareGroups(groups, "name").map((group) => group.name)).toEqual([
      "Alpha",
      "Mid",
      "Zoom",
    ]);
    expect(sortSoftwareGroups(groups, "installs")[0].name).toBe("Zoom");
    expect(sortSoftwareGroups(groups, "expiry").map((group) => group.name)).toEqual([
      "Mid",
      "Alpha",
      "Zoom",
    ]);
  });
});

const computer = (name: string, extra: Partial<DirectoryComputer> = {}): DirectoryComputer => ({
  pc: pc(name),
  processor: "Intel Core i5-10400",
  memoryGb: 16,
  storageGb: 512,
  storageType: "NVMe SSD",
  graphics: null,
  operatingSystem: "Windows 11 Pro",
  osVersion: "24H2",
  ...extra,
});

describe("hardware groups", () => {
  it("describes each component the way staff would read it", () => {
    const sample = computer("PC-01");
    expect(componentValue(sample, "processor")).toBe("Intel Core i5-10400");
    expect(componentValue(sample, "memory")).toBe("16 GB");
    expect(componentValue(sample, "storage")).toBe("512 GB NVMe SSD");
    expect(componentValue(sample, "os")).toBe("Windows 11 Pro 24H2");
    expect(componentValue(sample, "graphics")).toBeNull();
    expect(componentValue(computer("PC-02", { storageType: null }), "storage")).toBe("512 GB");
  });

  it("groups PCs by value with the most common first and unrecorded last", () => {
    const groups = groupHardware(
      [
        computer("PC-03", { processor: "AMD Ryzen 5" }),
        computer("PC-01"),
        computer("PC-02"),
        computer("PC-04", { processor: null }),
      ],
      "processor",
    );
    expect(groups.map((group) => [group.value, group.count])).toEqual([
      ["Intel Core i5-10400", 2],
      ["AMD Ryzen 5", 1],
      ["Not recorded", 1],
    ]);
    expect(groups[0].pcs.map((entry) => entry.name)).toEqual(["PC-01", "PC-02"]);
    expect(groups[2].recorded).toBe(false);
  });

  it("flags profiles missing a processor, memory, or storage", () => {
    expect(isIncompleteProfile(computer("PC-01"))).toBe(false);
    expect(isIncompleteProfile(computer("PC-02", { memoryGb: null }))).toBe(true);
    expect(isIncompleteProfile(computer("PC-03", { storageGb: null }))).toBe(true);
    expect(isIncompleteProfile(computer("PC-04", { processor: "  " }))).toBe(true);
  });
});
