import { AuditAction, Prisma } from "@prisma/client";

type AuditActor = { email?: string | null; id: string; username?: string | null };

type AuditEventInput = {
  action: AuditAction;
  actor?: AuditActor | null;
  entity?: {
    id?: string | null;
    itemId?: string | null;
    label?: string | null;
    type: string;
  };
  metadata?: Prisma.InputJsonObject;
  summary: string;
};

export function auditActorName(actor?: AuditActor | null) {
  const username = actor?.username?.trim();
  const email = actor?.email?.trim();
  return username && email ? `${username} | ${email}` : username || email || null;
}

export function auditEventData({ action, actor, entity, metadata, summary }: AuditEventInput): Prisma.InventoryAuditUncheckedCreateInput {
  return {
    action,
    actorId: actor?.id ?? null,
    actorName: auditActorName(actor),
    entityId: entity?.id ?? null,
    entityLabel: entity?.label ?? null,
    entityType: entity?.type ?? null,
    itemId: entity?.itemId ?? null,
    metadata,
    summary,
  };
}
