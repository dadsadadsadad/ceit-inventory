import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Refresh the cached client after schema changes.
const prismaSchemaVersion = `2026-09-11-reservations-and-qr-issues:${process.env.INVENTORY_DB_SCHEMA ?? "public"}`;
const databaseCache = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: string;
};
const connectionString = process.env.SCHOOL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set SCHOOL_DATABASE_URL for the school server or DATABASE_URL for development.");
}
// Dedicated schemas keep full workflow tests separate from school inventory.
const schema = process.env.INVENTORY_DB_SCHEMA;
if (schema && !/^ceit_test_[a-z0-9_]+$/.test(schema)) {
  throw new Error("Invalid test database schema.");
}
const configuredPoolSize = Number(process.env.DB_POOL_MAX ?? 5);
const poolSize =
  Number.isInteger(configuredPoolSize) && configuredPoolSize >= 1 && configuredPoolSize <= 20
    ? configuredPoolSize
    : 5;
const adapter = new PrismaPg(
  { connectionString, max: poolSize, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 },
  schema ? { schema } : undefined,
);

const cachedClient = databaseCache.prisma;
const schemaMatches = databaseCache.prismaSchemaVersion === prismaSchemaVersion;

export const prisma = cachedClient && schemaMatches ? cachedClient : new PrismaClient({ adapter });

// Reuse one connection pool across server routes.
databaseCache.prisma = prisma;
databaseCache.prismaSchemaVersion = prismaSchemaVersion;
