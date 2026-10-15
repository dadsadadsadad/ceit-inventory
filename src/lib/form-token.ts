import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { FormError } from "./form-action";

// signed token for public forms (item + time opened). blocks direct posts, instant submits and stale pages. rate limits are the real protection

const maxAgeMs = 6 * 60 * 60 * 1000;

// scripts submit instantly, e2e tests set FORM_TOKEN_MIN_AGE_MS=0
function minAgeMs() {
  const configured = Number(process.env.FORM_TOKEN_MIN_AGE_MS ?? 700);
  return Number.isFinite(configured) && configured >= 0 ? configured : 700;
}

function secret() {
  const value =
    process.env.REQUEST_RATE_LIMIT_SECRET ??
    process.env.SCHOOL_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Public form protection is not configured.");
  }
  return value;
}

function sign(scope: string, issuedAt: string) {
  return createHmac("sha256", secret()).update(`form:${scope}:${issuedAt}`).digest("hex");
}

// token format is <issuedAt>.<hmac>
export function issueFormToken(scope: string, now = Date.now()) {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(scope, issuedAt)}`;
}

export function assertFormToken(scope: string, token: string, now = Date.now()) {
  const [issuedAt = "", signature = ""] = token.split(".");
  // compare bytes, non-ascii chars take more bytes
  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(scope, issuedAt));
  const matches = given.length === expected.length && timingSafeEqual(given, expected);
  const age = now - Number(issuedAt);
  if (!matches || !Number.isFinite(age)) {
    throw new FormError("This form couldn't be verified. Reload and try again.");
  }
  if (age < minAgeMs()) {
    throw new FormError("That was too fast. Check your details and send again.");
  }
  if (age > maxAgeMs) {
    throw new FormError("This page has been open too long. Reload and try again.");
  }
}
