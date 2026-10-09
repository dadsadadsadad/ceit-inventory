"use server";

import { revalidatePath } from "next/cache";

import { auditEventData } from "@/lib/audit-event";
import { parseCalendarDay } from "@/lib/calendar";
import { runTransaction } from "@/lib/database-transaction";
import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { requireWriteAccess } from "@/lib/inventory-auth";

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
    // Counted, added, and recorded together, so the day's limit holds and nothing goes unrecorded.
    await runTransaction(async (transaction) => {
      if (
        (await transaction.calendarEvent.count({ where: { eventDate } })) >= maximumEventsPerDay
      ) {
        throw new FormError(`A day can hold up to ${maximumEventsPerDay} events.`);
      }
      const event = await transaction.calendarEvent.create({
        data: { title, notes, eventDate, createdByName: actor.username },
      });
      await transaction.inventoryAudit.create({
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

// Remove an event staff added. Loans, licenses, and warranties are not events and cannot be removed here.
export async function deleteCalendarEvent(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = requiredUuid(formData, "id", "Invalid event.");
    await runTransaction(async (transaction) => {
      const event = await transaction.calendarEvent.findUnique({ where: { id } });
      if (!event) {
        throw new FormError("This event was already removed.");
      }
      await transaction.calendarEvent.delete({ where: { id } });
      await transaction.inventoryAudit.create({
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
