"use server";

import { revalidatePath } from "next/cache";

import { FormError, formAction } from "@/lib/form-action";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import {
  eventKinds,
  isSummaryFrequency,
  isSummaryTime,
  summaryKinds,
  type EventKind,
  type NotificationKind,
} from "@/lib/notification-kinds";
import { mailConfigured, sendMail } from "@/lib/notifications";
import { prisma } from "@/prisma";

export async function saveNotificationSettings(formData: FormData) {
  return formAction(async () => {
    const user = await requireInventoryAccess();
    const notifyOn: NotificationKind[] = [];
    const notifyLater: EventKind[] = [];
    for (const kind of eventKinds) {
      const delivery = String(formData.get(`deliver-${kind.id}`) ?? "off");
      if (delivery === "now" || delivery === "summary") {
        notifyOn.push(kind.id);
      }
      if (delivery === "summary") {
        notifyLater.push(kind.id);
      }
    }
    const included = formData.getAll("summaryInclude").map(String);
    notifyOn.push(...summaryKinds.map((kind) => kind.id).filter((id) => included.includes(id)));

    const frequency = String(formData.get("summaryFrequency") ?? "");
    const time = String(formData.get("summaryTime") ?? "");
    const day = Number(formData.get("summaryDay") ?? 1);
    if (!isSummaryFrequency(frequency) || !isSummaryTime(time)) {
      throw new FormError("Pick how often and when the summary comes.");
    }
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new FormError("Pick a day for the weekly summary.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        notifyOn,
        notifyLater,
        summaryFrequency: frequency,
        summaryDay: day,
        summaryTime: time,
      },
    });
    revalidatePath("/dashboard/settings");
  });
}

export async function sendTestEmail() {
  return formAction(async () => {
    const user = await requireInventoryAccess();
    if (!mailConfigured()) {
      throw new FormError("Email isn't set up on the server yet.");
    }
    try {
      await sendMail([user.email], {
        subject: "Test email",
        lines: ["Email notifications are working."],
        link: "/dashboard/settings",
      });
    } catch (error) {
      console.error("Test email failed", error);
      throw new FormError("Couldn't send. Check the mail settings on the server.");
    }
  });
}
