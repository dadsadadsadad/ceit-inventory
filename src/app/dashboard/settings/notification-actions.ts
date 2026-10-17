"use server";

import { revalidatePath } from "next/cache";

import { FormError, formAction } from "@/lib/form-action";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { isNotificationKind } from "@/lib/notification-kinds";
import { mailConfigured, sendMail } from "@/lib/notifications";
import { prisma } from "@/prisma";

export async function saveNotificationSettings(formData: FormData) {
  return formAction(async () => {
    const user = await requireInventoryAccess();
    const kinds = [...new Set(formData.getAll("notifyOn").map(String))].filter(isNotificationKind);
    await prisma.user.update({ where: { id: user.id }, data: { notifyOn: kinds } });
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
