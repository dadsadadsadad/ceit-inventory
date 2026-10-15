import "server-only";

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { sessionCookieName } from "@/lib/session-cookie";
import { prisma } from "@/prisma";

const writableRoles = ["administrator", "staff"] as const;
// 1 week
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxSessionsPerUser = 5;
const sessionTokenPattern = /^[a-f0-9]{64}$/;
const scryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// only the hash is stored
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type InventoryUser = { email: string; id: string; role: string; username: string };

export function canManageInventory(role: string) {
  return writableRoles.includes(role as (typeof writableRoles)[number]);
}

export function canManageUsers(role: string) {
  return role === "administrator";
}

function derivePasswordHash(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, scryptOptions, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedHash = await derivePasswordHash(password, salt);
  return `scrypt-v1:${salt}:${derivedHash.toString("hex")}`;
}

export function passwordValidationMessage(password: string) {
  if (password.length < 8) {
    return "Use at least 8 characters.";
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Use at least one letter and one number.";
  }
  return null;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const values = passwordHash.split(":");
  // old hashes are salt:hash, newer ones scrypt-v1:salt:hash
  const [salt, savedHash] =
    values.length === 2 ? values : values[0] === "scrypt-v1" ? [values[1], values[2]] : [];
  if (!salt || !savedHash) {
    return false;
  }
  const derivedHash = await derivePasswordHash(password, salt);
  const storedHash = Buffer.from(savedHash, "hex");
  return storedHash.length === derivedHash.length && timingSafeEqual(storedHash, derivedHash);
}

// hash anyway so timing doesn't reveal which users exist
export async function simulatePasswordCheck(password: string) {
  await derivePasswordHash(password, "0".repeat(32));
}

export async function createSession(userId: string) {
  // the cookie gets the token, the db only gets its hash
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);

  await prisma.$transaction(async (tx) => {
    await tx.userSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await tx.userSession.create({
      data: { tokenHash: tokenHash(token), userId, expiresAt },
    });
    const olderSessions = await tx.userSession.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: maxSessionsPerUser,
      select: { id: true },
    });
    if (olderSessions.length) {
      await tx.userSession.deleteMany({
        where: { id: { in: olderSessions.map((session) => session.id) } },
      });
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
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
  const token = cookieStore.get(sessionCookieName)?.value;
  try {
    if (token) {
      await prisma.userSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
  } catch (error) {
    console.error("Unable to revoke the stored session during sign-out", error);
  } finally {
    cookieStore.delete({ name: sessionCookieName, path: "/" });
  }
}

// react cache is per request, so layout and page share one lookup
export const getCurrentInventoryUser = cache(async (): Promise<InventoryUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token || !sessionTokenPattern.test(token)) {
    return null;
  }
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: {
      expiresAt: true,
      user: {
        select: { id: true, email: true, username: true, role: true, isActive: true },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    username: session.user.username,
    role: session.user.role.toLowerCase(),
  };
});

export async function requireInventoryAccess() {
  const user = await getCurrentInventoryUser();
  if (!user) {
    redirect("/auth/login");
  }
  return user;
}

export async function requireWriteAccess() {
  const user = await requireInventoryAccess();
  if (!canManageInventory(user.role)) {
    throw new Error("You don't have permission to do that.");
  }
  return user;
}

export async function requireUserManager() {
  const user = await requireInventoryAccess();
  if (!canManageUsers(user.role)) {
    throw new Error("Only admins can manage accounts.");
  }
  return user;
}

export async function requireInventoryManagementPageAccess() {
  const user = await requireInventoryAccess();
  if (!canManageInventory(user.role)) {
    redirect("/dashboard");
  }
  return user;
}

export async function requireUserManagementPageAccess() {
  const user = await requireInventoryAccess();
  if (!canManageUsers(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
