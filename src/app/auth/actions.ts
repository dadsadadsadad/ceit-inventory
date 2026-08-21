"use server";

import { redirect } from "next/navigation";

import { clearSession, createSession, verifyPassword } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const maxEmailLength = 254;
const maxPasswordLength = 256;
const failedSignInWindowMs = 15 * 60 * 1000;
const lockDurationMs = 15 * 60 * 1000;
const maximumAttempts = 5;

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password || email.length > maxEmailLength || password.length > maxPasswordLength) {
    redirect("/auth/login?error=invalid-credentials");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const now = new Date();
  if (!user || !user.isActive) redirect("/auth/login?error=invalid-credentials");
  if (user.lockedUntil && user.lockedUntil > now) redirect("/auth/login?error=temporarily-locked");

  if (!(await verifyPassword(password, user.passwordHash))) {
    const isNewWindow = !user.firstFailedSignInAt || now.getTime() - user.firstFailedSignInAt.getTime() > failedSignInWindowMs;
    const failedSignInCount = isNewWindow ? 1 : user.failedSignInCount + 1;
    const lockedUntil = failedSignInCount >= maximumAttempts ? new Date(now.getTime() + lockDurationMs) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: { failedSignInCount, firstFailedSignInAt: isNewWindow ? now : user.firstFailedSignInAt, lockedUntil },
    });
    redirect(`/auth/login?error=${lockedUntil ? "temporarily-locked" : "invalid-credentials"}`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedSignInCount: 0, firstFailedSignInAt: null, lockedUntil: null },
  });
  await createSession(user.id);
  redirect("/dashboard");
}

export async function signOut() {
  await clearSession();
  redirect("/auth/login");
}
