"use server";

import { revalidatePath } from "next/cache";

import { auditEventData } from "@/lib/audit-event";
import { parseCalendarDay } from "@/lib/calendar";
import { runTransaction } from "@/lib/database-transaction";
import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { requireWriteAccess } from "@/lib/inventory-auth";

const maxEventsPerDay = 25;

export async function createCalendarEvent(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const day = String(formData.get("day") ?? "");
    const eventDate = parseCalendarDay(day);
    if (!eventDate) {
      throw new FormError("Pick a valid day.");
    }
    const title = requiredText(formData, "title", 120);
    const notes = optionalText(formData, "notes", 500);
    // count + insert + log in one transaction so the daily limit holds
    await runTransaction(async (tx) => {
      if ((await tx.calendarEvent.count({ where: { eventDate } })) >= maxEventsPerDay) {
        throw new FormError(`A day can hold up to ${maxEventsPerDay} events.`);
      }
      const event = await tx.calendarEvent.create({
        data: { title, notes, eventDate, createdByName: actor.username },
      });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: "CREATED",
          actor,
          entity: { id: event.id, label: title, type: "calendar-event" },
          metadata: { activityKind: "configuration", day },
          summary: `Calendar event added for ${day}: ${title}.`,
        }),
      });
    });
    revalidatePath("/dashboard");
  });
}

// only staff events can be deleted, not loans/licenses/warranties
export async function deleteCalendarEvent(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid event.");
    await runTransaction(async (tx) => {
      const event = await tx.calendarEvent.findUnique({ where: { id } });
      if (!event) {
        throw new FormError("This event was already deleted.");
      }
      await tx.calendarEvent.delete({ where: { id } });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: "DELETED",
          actor,
          entity: { id, label: event.title, type: "calendar-event" },
          metadata: { activityKind: "configuration" },
          summary: `Calendar event removed: ${event.title}.`,
        }),
      });
    });
    revalidatePath("/dashboard");
  });
}
