import type { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";

export const TYPE_LABELS: Record<string, string> = {
  meeting_created: "Reunión",
  meeting_updated: "Reunión actualizada",
  meeting_deleted: "Reunión eliminada",
  evidence_uploaded: "Evidencia subida",
  transcript_added: "Transcripción agregada",
  proposal_item_reviewed: "Cambio revisado",
  proposal_item_edited: "Propuesta editada",
  proposal_bulk_reviewed: "Cambios revisados en bloque",
  proposal_rejected: "Propuesta rechazada",
  proposal_applied: "Cambios aplicados",
  note_added: "Nota",
  stage_changed: "Cambio de etapa",
  task_created: "Tarea",
  task_assigned: "Tarea asignada",
  next_step_updated: "Próximo paso actualizado",
  field_updated: "Campo actualizado",
  contact_added: "Contacto agregado",
  contact_linked: "Contacto vinculado",
  opportunity_created: "Oportunidad creada",
  change_reverted: "Cambio deshecho",
};

const ACTIVITY_PAGE_SIZE = 25;

type TimelineInput = {
  organizationId: string;
  companyId: string;
  opportunityId?: string | null;
  type: string;
  title: string;
  summary?: string | null;
  refType?: string | null;
  refId?: string | null;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

// Append-only event log. Accepts a transaction client so it can be written
// atomically alongside the domain change that produced it. organizationId es
// explícito porque dentro de una transacción cruda no hay auto-scoping.
export async function appendTimelineEvent(
  client: Prisma.TransactionClient | TenantClient,
  input: TimelineInput,
) {
  await client.timelineEvent.create({
    data: {
      organizationId: input.organizationId,
      companyId: input.companyId,
      opportunityId: input.opportunityId ?? null,
      type: input.type,
      title: input.title,
      summary: input.summary ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      actorId: input.actorId ?? null,
      metadata: input.metadata,
    },
  });
}

export async function getCompanyTimeline(db: TenantClient, companyId: string) {
  const events = await db.timelineEvent.findMany({
    where: { companyId },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
  return attachActors(db, events);
}

export async function getOpportunityTimeline(
  db: TenantClient,
  opportunityId: string,
) {
  const events = await db.timelineEvent.findMany({
    where: { opportunityId },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
  return attachActors(db, events);
}

async function attachActors<
  T extends { actorId: string | null },
>(db: TenantClient, events: T[]) {
  const actorIds = [
    ...new Set(events.map((event) => event.actorId).filter((id) => id !== null)),
  ];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

  return events.map((event) => ({
    ...event,
    actor: event.actorId ? (actorsById.get(event.actorId) ?? null) : null,
  }));
}

export type ActivityFeedFilters = {
  type?: string;
  actorId?: string;
  companyId?: string;
  from?: Date;
  to?: Date;
  page?: number;
};

// Global, cross-company feed for the "Actividad" page. `actorId` on
// TimelineEvent has no FK to User (multi-tenant events may outlive an actor
// record), so actor names are resolved in a second batched lookup rather than
// a Prisma `include`.
export async function getActivityFeed(
  db: TenantClient,
  filters: ActivityFeedFilters = {},
) {
  const page = filters.page && filters.page > 0 ? filters.page : 1;

  const where: Prisma.TimelineEventWhereInput = {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [events, total] = await Promise.all([
    db.timelineEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
      include: { company: { select: { name: true } } },
    }),
    db.timelineEvent.count({ where }),
  ]);

  const actorIds = [
    ...new Set(events.map((event) => event.actorId).filter((id) => id !== null)),
  ];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

  return {
    events: events.map((event) => ({
      ...event,
      actor: event.actorId ? (actorsById.get(event.actorId) ?? null) : null,
    })),
    total,
    page,
    pageSize: ACTIVITY_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)),
  };
}
