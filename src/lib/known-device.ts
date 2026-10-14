import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { rateLimitSecret } from "./client-address";

// signed cookie set on sign in so the owner can still log in while their account is locked. removed on sign out
const cookieName = "ceit_known_device";
const lifetimeMs = 90 * 24 * 60 * 60 * 1000;

function signature(userId: string, issuedAt: string) {
  return createHmac("sha256", rateLimitSecret())
    .update(`known-device:${userId}:${issuedAt}`)
    .digest("hex");
}

export async function rememberDevice(userId: string, now = Date.now()) {
  const issuedAt = String(now);
  (await cookies()).set(cookieName, `${userId}.${issuedAt}.${signature(userId, issuedAt)}`, {
    expires: new Date(now + lifetimeMs),
    httpOnly: true,
    path: "/auth",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function isKnownDevice(userId: string, now = Date.now()) {
  const value = (await cookies()).get(cookieName)?.value ?? "";
  const [savedUser = "", issuedAt = "", saved = ""] = value.split(".");
  if (savedUser !== userId || now - Number(issuedAt) > lifetimeMs) {
    return false;
  }
  const given = Buffer.from(saved);
  const expected = Buffer.from(signature(userId, issuedAt));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function forgetDevice() {
  (await cookies()).delete({ name: cookieName, path: "/auth" });
}
