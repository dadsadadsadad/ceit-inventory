import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/prisma";
import { liveScopeTables, type LiveUpdateScope } from "./live-update-scope";

// Database-backed revisions work across workers and include additions, edits and deletions.
// Coalesce simultaneous viewers without retaining public QR codes indefinitely.
const cache = new Map<string, { expires: number; value: Promise<string> }>();

/** The revision for a QR code that matches no item, so nobody keeps a stream open for it. */
export const missingItemRevision = "missing";

export function liveRevision(qrCode?: string, scope: LiveUpdateScope = "dashboard") {
  const key = qrCode ? `qr:${qrCode}` : scope;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) {
    return existing.value;
  }
  const value = readRevision(qrCode, scope);
  // Coalesce the entire query, even if the database takes longer than the TTL.
  const entry = { expires: Infinity, value };
  cache.set(key, entry);
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
  // The schema is validated by src/prisma.ts before this module can query it.
  const schema = process.env.INVENTORY_DB_SCHEMA ?? "public";
  const table = (name: string) => Prisma.raw(`"${schema}"."${name}"`);
  let snapshot: unknown;
  if (qrCode) {
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
  // Only an opaque revision leaves the server; never staff/borrower data.
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
