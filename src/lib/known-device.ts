import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { rateLimitSecret } from "./client-address";

/**
 * A signed note left on a browser after its owner signs in. Five wrong passwords lock an
 * account, and anyone who knows a username could otherwise keep its owner locked out for good;
 * the owner's own browser, holding this note, can still sign in with the right password.
 * Signing out removes it, so a shared lab computer does not keep it.
 */
const cookieName = "ceit_known_device";
const lifetimeMs = 90 * 24 * 60 * 60 * 1000;

function signature(userId: string, issuedAt: string) {
  return createHmac("sha256", rateLimitSecret())
    .update(`known-device:${userId}:${issuedAt}`)
    .digest("hex");
}

/** Remember this browser for the person who just signed in. */
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

/** Has this person signed in on this browser before, and not signed out since? */
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

/** Forget this browser, on sign-out. */
export async function forgetDevice() {
  (await cookies()).delete({ name: cookieName, path: "/auth" });
}
