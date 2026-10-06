import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { FormError } from "./form-action";

/**
 * A signed note, put in each public form, that says "this page was opened at this time for this
 * item". A submission without one (a script posting straight to the server), with a forged one,
 * sent too quickly to have been typed, or from a page left open for hours is refused. It is a
 * cheap first defence; per-device rate limits and staff approval remain the real controls.
 */

const maximumAgeMs = 6 * 60 * 60 * 1000;

// Nobody fills in a form in under a second; a script posting it straight away does. Automated
// browser tests, which are as fast as a script, set FORM_TOKEN_MIN_AGE_MS=0 for their own server.
function minimumAgeMs() {
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

/** Create the token for a form, bound to what it is for (for example `borrow:<qr code>`). */
export function issueFormToken(scope: string, now = Date.now()) {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(scope, issuedAt)}`;
}

/** Refuse a submission whose token is missing, forged, too fast, or too old. */
export function assertFormToken(scope: string, token: string, now = Date.now()) {
  const [issuedAt = "", signature = ""] = token.split(".");
  const expected = sign(scope, issuedAt);
  const matches =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  const age = now - Number(issuedAt);
  if (!matches || !Number.isFinite(age)) {
    throw new FormError("This form could not be verified. Reload the page and try again.");
  }
  if (age < minimumAgeMs()) {
    throw new FormError("That was very quick. Check your details and send the form again.");
  }
  if (age > maximumAgeMs) {
    throw new FormError("This page has been open for a long time. Reload it and try again.");
  }
}
