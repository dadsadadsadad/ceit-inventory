"use server";

import { AuditAction } from "@prisma/client";

import { auditEventData } from "@/lib/audit-event";
import { parseCalendarDay } from "@/lib/calendar";
import { runTransaction } from "@/lib/database-transaction";
import { FormError, formAction } from "@/lib/form-action";
import { optionalText, requiredText, requiredUuid } from "@/lib/form-fields";
import { isUuid } from "@/lib/ids";
import { requireWriteAccess } from "@/lib/inventory-auth";
import { addDays, intervalLabel, maxIntervalDays } from "@/lib/maintenance-plans";
import { planItemsWhere } from "@/lib/maintenance-plan-queries";
import { manilaCalendarDate } from "@/lib/manila-date";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import { prisma } from "@/prisma";

function planId(formData: FormData) {
  return requiredUuid(formData, "id", "Invalid schedule.");
}

function optionalId(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    return null;
  }
  if (!isUuid(value)) {
    throw new FormError("Pick from the list.");
  }
  return value;
}

function readInterval(formData: FormData) {
  const raw = String(formData.get("intervalDays") ?? "").trim();
  const custom = raw === "custom" ? String(formData.get("customDays") ?? "").trim() : raw;
  const days = Number(custom);
  if (!/^\d+$/.test(custom) || days < 1 || days > maxIntervalDays) {
    throw new FormError(`Repeat every 1 to ${maxIntervalDays} days.`);
  }
  return days;
}

function readDueDay(formData: FormData) {
  const day = String(formData.get("nextDueOn") ?? "").trim();
  const date = parseCalendarDay(day);
  if (!date) {
    throw new FormError("Pick when it's next due.");
  }
  const today = manilaCalendarDate();
  if (day < addDays(today, -365) || day > addDays(today, maxIntervalDays)) {
    throw new FormError("Pick a due date within the next two years.");
  }
  return date;
}

// one item, or a room and/or a category
async function readScope(formData: FormData) {
  const itemId = optionalId(formData, "itemId");
  if (formData.get("scope") === "item" && !itemId) {
    throw new FormError("Pick the item from the list.");
  }
  if (itemId) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) {
      throw new FormError("That item no longer exists.");
    }
    return { itemId, locationId: null, categoryId: null };
  }
  const locationId = optionalId(formData, "locationId");
  const categoryId = optionalId(formData, "categoryId");
  if (!locationId && !categoryId) {
    throw new FormError("Pick an item, a room or a category.");
  }
  return { itemId: null, locationId, categoryId };
}

function planFields(formData: FormData) {
  return {
    title: requiredText(formData, "title", 120, "Task"),
    notes: optionalText(formData, "notes", 1_000, "Steps or notes"),
    intervalDays: readInterval(formData),
    nextDueOn: readDueDay(formData),
  };
}

export async function createMaintenancePlan(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const fields = planFields(formData);
    const scope = await readScope(formData);
    await runTransaction(async (tx) => {
      const plan = await tx.maintenancePlan.create({
        data: { ...fields, ...scope, createdByName: actor.username },
      });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: AuditAction.CREATED,
          actor,
          entity: {
            id: plan.id,
            itemId: scope.itemId,
            label: plan.title,
            type: "maintenance-plan",
          },
          metadata: { intervalDays: plan.intervalDays, ...scope },
          summary: `Preventive maintenance scheduled: ${plan.title} (${intervalLabel(plan.intervalDays).toLowerCase()}).`,
        }),
      });
    });
    refreshInventoryViews(scope.itemId ?? undefined);
  });
}

export async function updateMaintenancePlan(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = planId(formData);
    const fields = planFields(formData);
    const scope = await readScope(formData);
    await runTransaction(async (tx) => {
      const existing = await tx.maintenancePlan.findUnique({ where: { id } });
      if (!existing) {
        throw new FormError("This schedule no longer exists.");
      }
      await tx.maintenancePlan.update({ where: { id }, data: { ...fields, ...scope } });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: AuditAction.UPDATED,
          actor,
          entity: { id, itemId: scope.itemId, label: fields.title, type: "maintenance-plan" },
          metadata: { intervalDays: fields.intervalDays, ...scope },
          summary: `Preventive maintenance schedule edited: ${fields.title}.`,
        }),
      });
    });
    refreshInventoryViews(scope.itemId ?? undefined);
  });
}

// logs the work, marks every covered item checked and moves the due date on
export async function completeMaintenancePlan(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = planId(formData);
    const notes = optionalText(formData, "notes", 1_000, "Notes");
    const doneAt = new Date();
    const today = manilaCalendarDate(doneAt);
    const itemId = await runTransaction(async (tx) => {
      const plan = await tx.maintenancePlan.findUnique({ where: { id } });
      if (!plan || !plan.isActive) {
        throw new FormError("This schedule is paused or was removed.");
      }
      const items = await tx.inventoryItem.findMany({
        where: planItemsWhere(plan),
        select: { id: true },
      });
      const ids = items.map((item) => item.id);
      if (ids.length) {
        await tx.inventoryItem.updateMany({
          where: { id: { in: ids } },
          data: { lastCheckedAt: doneAt },
        });
        await tx.computer.updateMany({
          where: { itemId: { in: ids } },
          data: { lastCheckedAt: doneAt },
        });
      }
      await tx.maintenancePlanLog.create({
        data: { planId: plan.id, doneAt, doneByName: actor.username, notes, itemCount: ids.length },
      });
      await tx.maintenancePlan.update({
        where: { id: plan.id },
        data: {
          lastDoneAt: doneAt,
          lastDoneByName: actor.username,
          nextDueOn: new Date(`${addDays(today, plan.intervalDays)}T00:00:00.000Z`),
        },
      });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: AuditAction.UPDATED,
          actor,
          entity: { id: plan.id, itemId: plan.itemId, label: plan.title, type: "maintenance-plan" },
          metadata: { itemCount: ids.length, notes, transition: "DONE" },
          summary: `Preventive maintenance done: ${plan.title} (${ids.length} ${ids.length === 1 ? "item" : "items"}).`,
        }),
      });
      return plan.itemId;
    });
    refreshInventoryViews(itemId ?? undefined);
  });
}

export async function setMaintenancePlanActive(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = planId(formData);
    const isActive = formData.get("isActive") === "on";
    const itemId = await runTransaction(async (tx) => {
      const plan = await tx.maintenancePlan.findUnique({ where: { id } });
      if (!plan) {
        throw new FormError("This schedule no longer exists.");
      }
      // a resumed schedule that slipped far behind starts again from today
      const today = manilaCalendarDate();
      const restart =
        isActive && plan.nextDueOn.toISOString().slice(0, 10) < today
          ? { nextDueOn: new Date(`${today}T00:00:00.000Z`) }
          : {};
      await tx.maintenancePlan.update({ where: { id }, data: { isActive, ...restart } });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: AuditAction.UPDATED,
          actor,
          entity: { id, itemId: plan.itemId, label: plan.title, type: "maintenance-plan" },
          metadata: { isActive },
          summary: `Preventive maintenance ${isActive ? "resumed" : "paused"}: ${plan.title}.`,
        }),
      });
      return plan.itemId;
    });
    refreshInventoryViews(itemId ?? undefined);
  });
}

export async function deleteMaintenancePlan(formData: FormData) {
  return formAction(async () => {
    const actor = await requireWriteAccess();
    const id = planId(formData);
    const itemId = await runTransaction(async (tx) => {
      const plan = await tx.maintenancePlan.findUnique({ where: { id } });
      if (!plan) {
        throw new FormError("This schedule was already removed.");
      }
      await tx.maintenancePlan.delete({ where: { id } });
      await tx.inventoryAudit.create({
        data: auditEventData({
          action: AuditAction.DELETED,
          actor,
          entity: { id, itemId: plan.itemId, label: plan.title, type: "maintenance-plan" },
          summary: `Preventive maintenance schedule removed: ${plan.title}.`,
        }),
      });
      return plan.itemId;
    });
    refreshInventoryViews(itemId ?? undefined);
  });
}
