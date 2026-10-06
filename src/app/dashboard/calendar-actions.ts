"use server";

import { revalidatePath } from "next/cache";

import { auditEventData } from "@/lib/audit-event";
import { parseCalendarDay } from "@/lib/calendar";
import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

const maximumEventsPerDay = 25;

// Add an event to the dashboard calendar.
export async function createCalendarEvent(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const day = String(formData.get("day") ?? "");
    const eventDate = parseCalendarDay(day);
    if (!eventDate) {
      throw new FormError("Choose a valid day for the event.");
    }
    const title = requiredText(formData, "title", 120);
    const notes = optionalText(formData, "notes", 500);
    if ((await prisma.calendarEvent.count({ where: { eventDate } })) >= maximumEventsPerDay) {
      throw new FormError(`A day can hold up to ${maximumEventsPerDay} events.`);
    }
    const event = await prisma.calendarEvent.create({
      data: { title, notes, eventDate, createdByName: actor.username },
    });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "CREATED",
        actor,
        entity: { id: event.id, label: title, type: "calendar-event" },
        metadata: { activityKind: "configuration", day },
        summary: `Calendar event added for ${day}: ${title}.`,
      }),
    });
    revalidatePath("/dashboard");
  });
}

// Remove an event staff added. Loans, licenses, and warranties are not events and cannot be removed here.
export async function deleteCalendarEvent(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid event.");
    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) {
      throw new FormError("This event was already removed.");
    }
    await prisma.calendarEvent.delete({ where: { id } });
    await prisma.inventoryAudit.create({
      data: auditEventData({
        action: "DELETED",
        actor,
        entity: { id, label: event.title, type: "calendar-event" },
        metadata: { activityKind: "configuration" },
        summary: `Calendar event removed: ${event.title}.`,
      }),
    });
    revalidatePath("/dashboard");
  });
}
