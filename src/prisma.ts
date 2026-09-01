import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prismaSchemaVersion = "2026-09-01-individual-asset-checkout-status";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaSchemaVersion?: string };
const connectionString = process.env.SCHOOL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set SCHOOL_DATABASE_URL for the school server or DATABASE_URL for development.");
const adapter = new PrismaPg({ connectionString });

const cachedPrisma = globalForPrisma.prisma;
const cachedClientHasCurrentSchema = globalForPrisma.prismaSchemaVersion === prismaSchemaVersion;

export const prisma = cachedPrisma && cachedClientHasCurrentSchema ? cachedPrisma : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = prismaSchemaVersion;
}
