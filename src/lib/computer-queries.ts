import "server-only";

import { ItemStatus, type Prisma } from "@prisma/client";

import {
  licenseWarningDays,
  type DirectoryComputer,
  type LicenseFilter,
  type SoftwareEntry,
} from "./computer-directory";
import { isUuid } from "./ids";
import { everyTermMatches, searchTerms } from "./search-terms";
import { prisma } from "@/prisma";

/** The most rows the directory pages and reports will read in one request. */
export const directoryRowLimit = 20_000;

export type DirectoryFilters = {
  /** Include retired and lost PCs. By default only PCs in service are listed. */
  includeRetired?: boolean;
  license?: LicenseFilter;
  location?: string;
  q?: string;
};

function itemScope(filters: DirectoryFilters): Prisma.InventoryItemWhereInput {
  return {
    ...(filters.includeRetired ? {} : { status: { notIn: [ItemStatus.RETIRED, ItemStatus.LOST] } }),
    ...(filters.location && isUuid(filters.location) ? { locationId: filters.location } : {}),
  };
}

export function computerWhere(filters: DirectoryFilters): Prisma.ComputerWhereInput {
  const terms = searchTerms(filters.q);
  return {
    item: { is: itemScope(filters) },
    ...(terms.length
      ? {
          AND: everyTermMatches<Prisma.ComputerWhereInput>(terms, (term) => [
            { processor: { contains: term, mode: "insensitive" } },
            { graphics: { contains: term, mode: "insensitive" } },
            { operatingSystem: { contains: term, mode: "insensitive" } },
            { osVersion: { contains: term, mode: "insensitive" } },
            { storageType: { contains: term, mode: "insensitive" } },
            { macAddress: { contains: term, mode: "insensitive" } },
            { ipAddress: { contains: term, mode: "insensitive" } },
            { hardwareDescription: { contains: term, mode: "insensitive" } },
            { item: { is: { name: { contains: term, mode: "insensitive" } } } },
            { item: { is: { assetTag: { contains: term, mode: "insensitive" } } } },
            { item: { is: { location: { name: { contains: term, mode: "insensitive" } } } } },
            ...(/^\d{1,6}$/.test(term)
              ? [{ memoryGb: Number(term) }, { storageGb: Number(term) }]
              : []),
          ]),
        }
      : {}),
  };
}

export function softwareWhere(
  filters: DirectoryFilters,
  now = new Date(),
): Prisma.ComputerSoftwareWhereInput {
  const terms = searchTerms(filters.q);
  const warningEnd = new Date(now.getTime() + licenseWarningDays * 24 * 60 * 60 * 1000);
  const licenseCondition: Prisma.ComputerSoftwareWhereInput =
    filters.license === "expired"
      ? { licenseExpiresAt: { lt: now } }
      : filters.license === "expiring"
        ? { licenseExpiresAt: { gte: now, lte: warningEnd } }
        : filters.license === "dated"
          ? { licenseExpiresAt: { not: null } }
          : filters.license === "none"
            ? { licenseExpiresAt: null }
            : filters.license === "licensed"
              ? { isLicensed: true }
              : filters.license === "unlicensed"
                ? { isLicensed: false }
                : {};
  return {
    computer: { is: { item: { is: itemScope(filters) } } },
    ...licenseCondition,
    ...(terms.length
      ? {
          AND: everyTermMatches<Prisma.ComputerSoftwareWhereInput>(terms, (term) => [
            { name: { contains: term, mode: "insensitive" } },
            { version: { contains: term, mode: "insensitive" } },
            { licenseKeyHint: { contains: term, mode: "insensitive" } },
            {
              computer: { is: { item: { is: { name: { contains: term, mode: "insensitive" } } } } },
            },
            {
              computer: {
                is: { item: { is: { assetTag: { contains: term, mode: "insensitive" } } } },
              },
            },
            {
              computer: {
                is: {
                  item: { is: { location: { name: { contains: term, mode: "insensitive" } } } },
                },
              },
            },
          ]),
        }
      : {}),
  };
}

const pcSelect = {
  id: true,
  name: true,
  assetTag: true,
  location: { select: { name: true } },
} satisfies Prisma.InventoryItemSelect;

/** PCs with their hardware profile, for the Hardware view and report. */
export async function loadComputers(filters: DirectoryFilters) {
  const rows = await prisma.computer.findMany({
    where: computerWhere(filters),
    select: {
      graphics: true,
      memoryGb: true,
      operatingSystem: true,
      osVersion: true,
      processor: true,
      storageGb: true,
      storageType: true,
      macAddress: true,
      ipAddress: true,
      lastCheckedAt: true,
      item: { select: pcSelect },
    },
    orderBy: [{ item: { name: "asc" } }, { id: "asc" }],
    take: directoryRowLimit + 1,
  });
  const truncated = rows.length > directoryRowLimit;
  const computers: (DirectoryComputer & {
    ipAddress: string | null;
    lastCheckedAt: Date | null;
    macAddress: string | null;
  })[] = rows.slice(0, directoryRowLimit).map((row) => ({
    graphics: row.graphics,
    memoryGb: row.memoryGb,
    operatingSystem: row.operatingSystem,
    osVersion: row.osVersion,
    processor: row.processor,
    storageGb: row.storageGb,
    storageType: row.storageType,
    macAddress: row.macAddress,
    ipAddress: row.ipAddress,
    lastCheckedAt: row.lastCheckedAt,
    pc: {
      id: row.item.id,
      name: row.item.name,
      assetTag: row.item.assetTag,
      room: row.item.location.name,
    },
  }));
  return { computers, truncated };
}

/** Software installed on PCs, one entry per installation, for the Software view and report. */
export async function loadSoftware(filters: DirectoryFilters, now = new Date()) {
  const rows = await prisma.computerSoftware.findMany({
    where: softwareWhere(filters, now),
    select: {
      name: true,
      version: true,
      licenseKeyHint: true,
      licenseExpiresAt: true,
      isLicensed: true,
      installedAt: true,
      computer: { select: { item: { select: pcSelect } } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: directoryRowLimit + 1,
  });
  const truncated = rows.length > directoryRowLimit;
  const entries: SoftwareEntry[] = rows.slice(0, directoryRowLimit).map((row) => ({
    name: row.name,
    version: row.version,
    licenseKeyHint: row.licenseKeyHint,
    licenseExpiresAt: row.licenseExpiresAt,
    isLicensed: row.isLicensed,
    installedAt: row.installedAt,
    pc: {
      id: row.computer.item.id,
      name: row.computer.item.name,
      assetTag: row.computer.item.assetTag,
      room: row.computer.item.location.name,
    },
  }));
  return { entries, truncated };
}
