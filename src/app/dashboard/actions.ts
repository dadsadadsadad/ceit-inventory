"use server";

import { revalidatePath } from "next/cache";

import { requireWriteAccess } from "@/lib/supabase/server";
import { prisma } from "@/prisma";

const sharedDashboardNoteScope = "shared-dashboard";
const maximumDashboardNoteLength = 5_000;

function dashboardNoteContent(formData: FormData) {
  const value = formData.get("content");
  if (typeof value !== "string") throw new Error("Enter a valid dashboard note.");

  const content = value.trim();
  if (content.length > maximumDashboardNoteLength) {
    throw new Error(`Dashboard notes must be ${maximumDashboardNoteLength.toLocaleString()} characters or fewer.`);
  }

  return content;
}

export async function saveDashboardNote(formData: FormData) {
  const actor = await requireWriteAccess();
  const content = dashboardNoteContent(formData);

  await prisma.dashboardNote.upsert({
    where: { scope: sharedDashboardNoteScope },
    create: { scope: sharedDashboardNoteScope, content, updatedByName: actor.email },
    update: { content, updatedByName: actor.email },
  });

  revalidatePath("/dashboard");
}
