import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/prisma";
import { liveScopeTables, type LiveUpdateScope } from "./live-update-scope";

// db based so it works across workers, cached briefly so viewers share one query
const cache = new Map<string, { expires: number; value: Promise<string> }>();

// revision for unknown codes
export const missingItemRevision = "missing";

export function liveRevision(qrCode?: string, scope: LiveUpdateScope = "dashboard") {
  const key = qrCode ? `qr:${qrCode}` : scope;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) {
    return existing.value;
  }
  const value = readRevision(qrCode, scope);
  // cache the promise so slow queries are still shared
  const entry = { expires: Infinity, value };
  cache.set(key, entry);
  // drop the oldest entry
  if (cache.size > 200) {
    cache.delete(cache.keys().next().value!);
  }
  void value.then(
    () => {
      entry.expires = Date.now() + 2_000;
    },
    () => {
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
    },
  );
  return value;
}

async function readRevision(qrCode: string | undefined, scope: LiveUpdateScope) {
  // schema name is validated in src/prisma.ts
  const schema = process.env.INVENTORY_DB_SCHEMA ?? "public";
  const table = (name: string) => Prisma.raw(`"${schema}"."${name}"`);
  let snapshot: unknown;
  if (qrCode) {
    // item, its category/room and its loans
    snapshot = await prisma.$queryRaw(Prisma.sql`
      SELECT i."updatedAt", i.status, i.quantity, c."updatedAt" AS category, l."updatedAt" AS location,
        (SELECT concat(count(*), ':', max(b."updatedAt"))
         FROM ${table("BorrowRequest")} b WHERE b."inventoryItemId" = i.id) AS loans
      FROM ${table("InventoryItem")} i
      JOIN ${table("Category")} c ON c.id = i."categoryId"
      JOIN ${table("Location")} l ON l.id = i."locationId"
      WHERE i."qrCode" = ${qrCode}
    `);
    if (Array.isArray(snapshot) && snapshot.length === 0) {
      return missingItemRevision;
    }
  } else {
    // row count + latest timestamp per table, any change changes the hash
    const parts = liveScopeTables[scope].map((name) => {
      const timestamp =
        name === "InventoryAudit" || name === "InventoryItemPhoto" ? "createdAt" : "updatedAt";
      return Prisma.sql`
        SELECT ${name} AS entity, concat(count(*), ':', max(${Prisma.raw(`"${timestamp}"`)})) AS revision
        FROM ${table(name)}
      `;
    });
    snapshot = await prisma.$queryRaw(
      Prisma.sql`${Prisma.join(parts, " UNION ALL ")} ORDER BY entity`,
    );
  }
  // only a hash goes to the client
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
