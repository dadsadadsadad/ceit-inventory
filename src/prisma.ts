import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Change this whenever a Prisma migration changes the generated client shape.
// During development, this prevents Next's retained global client from querying
// columns that have just been removed by a migration.
const prismaSchemaVersion = "2026-09-02-remove-maintenance-assignments";
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
