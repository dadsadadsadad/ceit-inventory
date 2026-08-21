import "server-only";

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/prisma";

const sessionCookie = "ceit_inventory_session";
const writableRoles = ["administrator", "custodian", "staff"] as const;
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const maximumSessionsPerUser = 5;
const sessionTokenPattern = /^[a-f0-9]{64}$/;
const scryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type InventoryUser = { email: string; id: string; role: string };

export function canManageInventory(role: string) {
  return writableRoles.includes(role as (typeof writableRoles)[number]);
}

export function canManageAdministration(role: string) {
  return role === "administrator";
}

function derivePasswordHash(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, scryptOptions, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedHash = await derivePasswordHash(password, salt);
  return `scrypt-v1:${salt}:${derivedHash.toString("hex")}`;
}

export function passwordValidationMessage(password: string) {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const values = passwordHash.split(":");
  const [salt, savedHash] = values.length === 2 ? values : values[0] === "scrypt-v1" ? [values[1], values[2]] : [];
  if (!salt || !savedHash) return false;
  const derivedHash = await derivePasswordHash(password, salt);
  const storedHash = Buffer.from(savedHash, "hex");
  return storedHash.length === derivedHash.length && timingSafeEqual(storedHash, derivedHash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);

  await prisma.$transaction(async (transaction) => {
    await transaction.userSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await transaction.userSession.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
    const olderSessions = await transaction.userSession.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: maximumSessionsPerUser,
      select: { id: true },
    });
    if (olderSessions.length) await transaction.userSession.deleteMany({ where: { id: { in: olderSessions.map((session) => session.id) } } });
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
    priority: "high",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (token) await prisma.userSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  cookieStore.delete({ name: sessionCookie, path: "/" });
}

export async function getCurrentInventoryUser(): Promise<InventoryUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (!token || !sessionTokenPattern.test(token)) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return { id: session.user.id, email: session.user.email, role: session.user.role.toLowerCase() };
}

export async function requireInventoryAccess() {
  const user = await getCurrentInventoryUser();
  if (!user) redirect("/auth/login");
  return user;
}

export async function requireWriteAccess() {
  const user = await requireInventoryAccess();
  if (!canManageInventory(user.role)) throw new Error("You do not have permission to change inventory records.");
  return user;
}

export async function requireAdministrator() {
  const user = await requireInventoryAccess();
  if (!canManageAdministration(user.role)) throw new Error("Only administrators can manage accounts and inventory setup.");
  return user;
}
