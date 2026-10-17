"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { normalizeLayout } from "@/lib/dashboard-layout";
import { FormError, formAction } from "@/lib/form-action";
import { requireInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

function refresh() {
  revalidatePath("/dashboard");
}

export async function saveDashboardLayout(formData: FormData) {
  return formAction(async () => {
    const user = await requireInventoryAccess();
    const text = String(formData.get("layout") ?? "");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new FormError("Couldn't read the layout. Refresh and try again.");
    }
    if (text.length > 10_000 || !Array.isArray(raw)) {
      throw new FormError("Couldn't read the layout. Refresh and try again.");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { dashboardLayout: normalizeLayout(raw) },
    });
    refresh();
  });
}

export async function resetDashboardLayout() {
  return formAction(async () => {
    const user = await requireInventoryAccess();
    await prisma.user.update({
      where: { id: user.id },
      data: { dashboardLayout: Prisma.DbNull },
    });
    refresh();
  });
}
