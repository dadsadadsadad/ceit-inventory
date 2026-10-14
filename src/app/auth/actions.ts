"use server";

import { redirect } from "next/navigation";

import { isAccountLocked, recordFailedPassword } from "@/lib/account-lock";
import { auditEventData } from "@/lib/audit-event";
import { stripControlCharacters } from "@/lib/clean-text";
import {
  clearSession,
  createSession,
  getCurrentInventoryUser,
  simulatePasswordCheck,
  verifyPassword,
} from "@/lib/inventory-auth";
import { forgetDevice, isKnownDevice, rememberDevice } from "@/lib/known-device";
import { isSignInThrottled, recordFailedSignInAttempt } from "@/lib/sign-in-throttle";
import { prisma } from "@/prisma";

const maxIdentifierLength = 254;
const maxPasswordLength = 256;

export async function signIn(formData: FormData) {
  const identifier = stripControlCharacters(String(formData.get("identifier") ?? ""))
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (
    !identifier ||
    !password ||
    identifier.length > maxIdentifierLength ||
    password.length > maxPasswordLength
  ) {
    redirect("/auth/login?error=invalid-credentials");
  }
  // check the throttle before hashing, hashing is slow on purpose
  if (await isSignInThrottled()) {
    redirect("/auth/login?error=too-many-attempts");
  }

  const user = await prisma.user.findUnique({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
  });
  const now = new Date();
  // same error for locked, wrong password and unknown user so usernames can't be guessed
  if (!user || !user.isActive) {
    await simulatePasswordCheck(password);
    await recordFailedSignInAttempt();
    redirect("/auth/login?error=invalid-credentials");
  }
  // known devices can still sign in while locked, see known-device.ts
  if (isAccountLocked(user, now) && !(await isKnownDevice(user.id))) {
    await simulatePasswordCheck(password);
    await recordFailedSignInAttempt();
    redirect("/auth/login?error=invalid-credentials");
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordFailedPassword(user.id);
    await recordFailedSignInAttempt();
    redirect("/auth/login?error=invalid-credentials");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedSignInCount: 0, firstFailedSignInAt: null, lockedUntil: null },
    }),
    prisma.inventoryAudit.create({
      data: auditEventData({
        action: "SIGNED_IN",
        actor: user,
        entity: { id: user.id, label: `${user.username} | ${user.email}`, type: "session" },
        metadata: { activityKind: "session" },
        summary: "Account signed in.",
      }),
    }),
  ]);
  await createSession(user.id);
  await rememberDevice(user.id);
  redirect("/dashboard");
}

export async function signOut() {
  try {
    const actor = await getCurrentInventoryUser();
    if (actor) {
      await prisma.inventoryAudit.create({
        data: auditEventData({
          action: "SIGNED_OUT",
          actor,
          entity: { id: actor.id, label: `${actor.username} | ${actor.email}`, type: "session" },
          metadata: { activityKind: "session" },
          summary: "Account signed out.",
        }),
      });
    }
  } catch (error) {
    console.error("Unable to record sign-out audit event", error);
  }
  await clearSession();
  await forgetDevice();
  redirect("/auth/login");
}
