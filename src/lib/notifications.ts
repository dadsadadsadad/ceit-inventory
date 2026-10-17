import "server-only";
import nodemailer from "nodemailer";

import type { NotificationKind } from "./notification-kinds";
import { prisma } from "@/prisma";

// smtp settings come from the environment, nothing is sent until they are set
function mailSettings() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 465);
  return {
    from: process.env.MAIL_FROM?.trim() || `CEIT Inventory <${user}>`,
    transport: { host, port, secure: port === 465, auth: { user, pass } },
  };
}

export function mailConfigured() {
  return mailSettings() !== null;
}

export function appLink(path: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

type Mail = { subject: string; lines: string[]; link?: string };

function body({ lines, link }: Mail) {
  return [...lines, ...(link ? ["", `Open: ${appLink(link)}`] : [])].join("\n");
}

export async function sendMail(to: string[], mail: Mail) {
  const settings = mailSettings();
  if (!settings || !to.length) {
    return false;
  }
  const transporter = nodemailer.createTransport(settings.transport);
  // bcc so staff don't see each other's addresses
  await transporter.sendMail({
    from: settings.from,
    to: settings.from,
    bcc: to,
    subject: `[CEIT Inventory] ${mail.subject}`,
    text: `${body(mail)}\n\nChange which emails you get in Settings.`,
  });
  return true;
}

export async function staffWanting(kind: NotificationKind) {
  const users = await prisma.user.findMany({
    where: { isActive: true, notifyOn: { has: kind } },
    select: { email: true },
  });
  return users.map((user) => user.email);
}

// never let a failed email break the request that triggered it
export async function notifyStaff(kind: NotificationKind, mail: Mail) {
  if (!mailConfigured()) {
    return;
  }
  try {
    await sendMail(await staffWanting(kind), mail);
  } catch (error) {
    console.error(`Couldn't send the ${kind} email`, error);
  }
}
