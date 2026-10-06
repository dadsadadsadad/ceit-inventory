/** Pure grouping rules behind the Hardware and Software views (and their reports). */

export type DirectoryPc = {
  assetTag: string | null;
  id: string;
  name: string;
  room: string;
};

// ---------------------------------------------------------------- software

export const licenseWarningDays = 30;

export const licenseFilters = [
  "expired",
  "expiring",
  "dated",
  "none",
  "licensed",
  "unlicensed",
] as const;
export type LicenseFilter = (typeof licenseFilters)[number];

export function isLicenseFilter(value: string | null | undefined): value is LicenseFilter {
  return licenseFilters.includes(value as LicenseFilter);
}

export type LicenseState = "expired" | "expiring" | "valid" | "none";

export function licenseState(expiresAt: Date | null, now = new Date()): LicenseState {
  if (!expiresAt) {
    return "none";
  }
  if (expiresAt.getTime() < now.getTime()) {
    return "expired";
  }
  return expiresAt.getTime() - now.getTime() <= licenseWarningDays * 24 * 60 * 60 * 1000
    ? "expiring"
    : "valid";
}

export function licenseStateLabel(state: LicenseState) {
  return {
    expired: "License expired",
    expiring: `Expires within ${licenseWarningDays} days`,
    valid: "License current",
    none: "No license date",
  }[state];
}

export type SoftwareEntry = {
  installedAt: Date | null;
  /** Whether this copy is marked as licensed; empty when nobody has said. */
  isLicensed: boolean | null;
  licenseExpiresAt: Date | null;
  licenseKeyHint: string | null;
  name: string;
  pc: DirectoryPc;
  version: string | null;
};

export type SoftwareGroup = {
  /** The title as most PCs spell it. */
  name: string;
  installs: SoftwareEntry[];
  rooms: string[];
  /** The earliest license expiry among the installations, if any has one. */
  soonestExpiry: Date | null;
  /** The most urgent license state among the installations. */
  state: LicenseState;
  versions: { count: number; version: string }[];
};

const stateRank: Record<LicenseState, number> = { expired: 0, expiring: 1, valid: 2, none: 3 };

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/** One group per software title, ignoring capitalization and surrounding spaces. */
export function groupSoftware(entries: SoftwareEntry[], now = new Date()): SoftwareGroup[] {
  const groups = new Map<string, SoftwareEntry[]>();
  for (const entry of entries) {
    const key = entry.name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map((installs) => {
    const versionCounts = new Map<string, number>();
    for (const install of installs) {
      const version = install.version?.trim() || "Not recorded";
      versionCounts.set(version, (versionCounts.get(version) ?? 0) + 1);
    }
    const expiries = installs
      .map((install) => install.licenseExpiresAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    const states = installs.map((install) => licenseState(install.licenseExpiresAt, now));
    return {
      name: mostCommon(installs.map((install) => install.name.trim())),
      installs: [...installs].sort(
        (a, b) =>
          a.pc.room.localeCompare(b.pc.room, undefined, { numeric: true }) ||
          a.pc.name.localeCompare(b.pc.name, undefined, { numeric: true }),
      ),
      rooms: [...new Set(installs.map((install) => install.pc.room))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
      soonestExpiry: expiries[0] ?? null,
      state: states.sort((a, b) => stateRank[a] - stateRank[b])[0],
      versions: [...versionCounts.entries()]
        .map(([version, count]) => ({ version, count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.version.localeCompare(b.version, undefined, { numeric: true }),
        ),
    };
  });
}

export type SoftwareSort = "name" | "installs" | "expiry";

export function sortSoftwareGroups(groups: SoftwareGroup[], sort: SoftwareSort) {
  const byName = (a: SoftwareGroup, b: SoftwareGroup) => a.name.localeCompare(b.name);
  return [...groups].sort((a, b) => {
    if (sort === "installs") {
      return b.installs.length - a.installs.length || byName(a, b);
    }
    if (sort === "expiry") {
      // Soonest expiry first, with titles that have no license date last.
      const left = a.soonestExpiry?.getTime() ?? Infinity;
      const right = b.soonestExpiry?.getTime() ?? Infinity;
      return left - right || byName(a, b);
    }
    return byName(a, b);
  });
}

// ---------------------------------------------------------------- hardware

export type HardwareComponent = "processor" | "memory" | "storage" | "graphics" | "os";

export const hardwareComponents: { label: string; value: HardwareComponent }[] = [
  { value: "processor", label: "Processor" },
  { value: "memory", label: "Memory" },
  { value: "storage", label: "Storage" },
  { value: "graphics", label: "Graphics" },
  { value: "os", label: "Operating system" },
];

export function isHardwareComponent(value: string | undefined): value is HardwareComponent {
  return hardwareComponents.some((component) => component.value === value);
}

export type DirectoryComputer = {
  graphics: string | null;
  memoryGb: number | null;
  operatingSystem: string | null;
  osVersion: string | null;
  pc: DirectoryPc;
  processor: string | null;
  storageGb: number | null;
  storageType: string | null;
};

function clean(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

/** How one PC describes a component, or `null` when nothing was recorded. */
export function componentValue(computer: DirectoryComputer, component: HardwareComponent) {
  switch (component) {
    case "processor":
      return clean(computer.processor);
    case "graphics":
      return clean(computer.graphics);
    case "memory":
      return computer.memoryGb === null ? null : `${computer.memoryGb} GB`;
    case "storage":
      return computer.storageGb === null
        ? null
        : [`${computer.storageGb} GB`, clean(computer.storageType)].filter(Boolean).join(" ");
    case "os":
      return (
        [clean(computer.operatingSystem), clean(computer.osVersion)].filter(Boolean).join(" ") ||
        null
      );
  }
}

export type HardwareGroup = {
  count: number;
  pcs: DirectoryPc[];
  /** `false` for the group of PCs that have nothing recorded for this component. */
  recorded: boolean;
  value: string;
};

/** PCs grouped by what they report for one component: most common first, unrecorded last. */
export function groupHardware(
  computers: DirectoryComputer[],
  component: HardwareComponent,
): HardwareGroup[] {
  const groups = new Map<string, DirectoryPc[]>();
  const unrecorded: DirectoryPc[] = [];
  for (const computer of computers) {
    const value = componentValue(computer, component);
    if (value === null) {
      unrecorded.push(computer.pc);
    } else {
      groups.set(value, [...(groups.get(value) ?? []), computer.pc]);
    }
  }
  const recorded = [...groups.entries()]
    .map(([value, pcs]) => ({ value, pcs: sortPcs(pcs), count: pcs.length, recorded: true }))
    .sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value, undefined, { numeric: true }),
    );
  return unrecorded.length
    ? [
        ...recorded,
        {
          value: "Not recorded",
          pcs: sortPcs(unrecorded),
          count: unrecorded.length,
          recorded: false,
        },
      ]
    : recorded;
}

function sortPcs(pcs: DirectoryPc[]) {
  return [...pcs].sort(
    (a, b) =>
      a.room.localeCompare(b.room, undefined, { numeric: true }) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/** A PC profile is incomplete when its processor, memory, or storage is missing. */
export function isIncompleteProfile(computer: DirectoryComputer) {
  return (
    componentValue(computer, "processor") === null ||
    componentValue(computer, "memory") === null ||
    componentValue(computer, "storage") === null
  );
}
