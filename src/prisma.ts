import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Change this whenever a Prisma migration changes the generated client shape.
// During development, this prevents Next's retained global client from querying
// columns that have just been removed by a migration.
const prismaSchemaVersion = `2026-09-11-reservations-and-qr-issues:${process.env.INVENTORY_DB_SCHEMA ?? "public"}`;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaSchemaVersion?: string };
const connectionString = process.env.SCHOOL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set SCHOOL_DATABASE_URL for the school server or DATABASE_URL for development.");
// Dedicated schemas keep full workflow tests separate from school inventory.
const schema = process.env.INVENTORY_DB_SCHEMA;
if (schema && !/^ceit_test_[a-z0-9_]+$/.test(schema)) throw new Error("Invalid test database schema.");
const requestedPoolSize = Number(process.env.DB_POOL_MAX ?? 5);
const poolSize = Number.isInteger(requestedPoolSize) && requestedPoolSize >= 1 && requestedPoolSize <= 20 ? requestedPoolSize : 5;
const adapter = new PrismaPg({ connectionString, max: poolSize, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 }, schema ? { schema } : undefined);

const cachedPrisma = globalForPrisma.prisma;
const cachedClientHasCurrentSchema = globalForPrisma.prismaSchemaVersion === prismaSchemaVersion;

export const prisma = cachedPrisma && cachedClientHasCurrentSchema ? cachedPrisma : new PrismaClient({ adapter });

// Next can evaluate server bundles separately in one process. Reuse the same
// client in production too, so each route does not open its own connection pool.
globalForPrisma.prisma = prisma;
globalForPrisma.prismaSchemaVersion = prismaSchemaVersion;
