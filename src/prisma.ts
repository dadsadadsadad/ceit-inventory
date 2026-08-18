import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prismaSchemaVersion = "2026-08-12-remove-reorder-level";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaSchemaVersion?: string };
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to start the inventory application.");
const adapter = new PrismaPg({ connectionString });

const cachedPrisma = globalForPrisma.prisma;
const cachedClientHasCurrentSchema = globalForPrisma.prismaSchemaVersion === prismaSchemaVersion;

export const prisma = cachedPrisma && cachedClientHasCurrentSchema ? cachedPrisma : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = prismaSchemaVersion;
}
