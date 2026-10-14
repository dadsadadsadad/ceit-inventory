import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prismaSchemaVersion = `2026-10-08-calendar-events:${process.env.INVENTORY_DB_SCHEMA ?? "public"}`;
const databaseCache = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: string;
};
const connectionString = process.env.SCHOOL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set SCHOOL_DATABASE_URL for the school server or DATABASE_URL for development.");
}
// e2e tests use their own schema
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

// reuse one pool
databaseCache.prisma = prisma;
databaseCache.prismaSchemaVersion = prismaSchemaVersion;
