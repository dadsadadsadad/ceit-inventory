"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { auditEventData } from "@/lib/audit-event";
import { clearSession, createSession, getCurrentInventoryUser, verifyPassword } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const maxIdentifierLength = 254;
const maxPasswordLength = 256;
const failedSignInWindowMs = 15 * 60 * 1000;
const lockDurationMs = 15 * 60 * 1000;
const maximumAttempts = 5;

async function recordFailedSignIn(userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const current = await transaction.user.findUnique({ where: { id: userId } });
        if (!current) return false;
        const now = new Date();
        if (current.lockedUntil && current.lockedUntil > now) return true;
        const isNewWindow = !current.firstFailedSignInAt || now.getTime() - current.firstFailedSignInAt.getTime() > failedSignInWindowMs;
        const failedSignInCount = isNewWindow ? 1 : current.failedSignInCount + 1;
        const lockedUntil = failedSignInCount >= maximumAttempts ? new Date(now.getTime() + lockDurationMs) : null;
        await transaction.user.update({
          where: { id: userId },
          data: { failedSignInCount, firstFailedSignInAt: isNewWindow ? now : current.firstFailedSignInAt, lockedUntil },
        });
        return Boolean(lockedUntil);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 4) continue;
      throw error;
    }
  }
  return true;
}

export async function signIn(formData: FormData) {
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password || identifier.length > maxIdentifierLength || password.length > maxPasswordLength) {
    redirect("/auth/login?error=invalid-credentials");
  }

  const user = await prisma.user.findUnique({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
  });
  const now = new Date();
  if (!user || !user.isActive) redirect("/auth/login?error=invalid-credentials");
  if (user.lockedUntil && user.lockedUntil > now) redirect("/auth/login?error=temporarily-locked");

  if (!(await verifyPassword(password, user.passwordHash))) {
    const locked = await recordFailedSignIn(user.id);
    redirect(`/auth/login?error=${locked ? "temporarily-locked" : "invalid-credentials"}`);
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
  redirect("/auth/login");
}
