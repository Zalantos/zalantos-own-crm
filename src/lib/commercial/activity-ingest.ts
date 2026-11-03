import { Prisma } from "@prisma/client";
import { z } from "zod";
import { withOrgTransaction, type TenantClient } from "@/lib/tenant";
import { normalizeEmail } from "@/lib/crm/person-dedup";
import { insertLoggedActivity } from "@/lib/crm/activity-records";
import { INTERACTION_TYPES } from "@/lib/activity-types";
import { ACTIVE_LEAD_STATUSES } from "@/lib/commercial/leads";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalString = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

// Contrato n8n → POST /api/integrations/activities (ver
// docs/integrations/commercial-events.md). Registra algo que YA ocurrió.
export const activityIngestSchema = z.object({
  source: z.string().trim().min(1).max(50),
  external_id: z.string().trim().min(1).max(300),
  type: z.enum(INTERACTION_TYPES),
  occurred_at: z.coerce.date(),
  title: z.string().trim().min(1).max(300),
  summary: optionalString(10_000),
  outcomes: optionalString(5_000),
  duration_minutes: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(1440).optional()),
  participants: z
    .array(
      z.object({
        email: optionalString(320),
        phone: optionalString(50),
        name: optionalString(200),
      }),
    )
    .max(50)
    .default([]),
  opportunity_id: optionalString(100),
  commercial_lead_id: optionalString(100),
  commercial_partner_id: optionalString(100),
  company_id: optionalString(100),
});

export type ActivityIngestPayload = z.infer<typeof activityIngestSchema>;

export type ActivityIngestResult =
  | { status: "created"; activityId: string }
  | { status: "duplicate"; activityId: string }
  | { status: "unmatched"; reason: string };

function normalizePhone(phone: string | undefined) {
  const digits = phone?.replace(/[^\d+]/g, "") ?? "";
  return digits.length >= 6 ? digits : null;
}

// Resuelve personas por email/teléfono dentro de la org y deriva los
// vínculos: ids explícitos (validados en la org) > lead activo de la persona
// > empresa de la persona. Sin vínculo no se crea nada (no hay huérfanas).
export async function ingestExternalActivity(
  db: TenantClient,
  organizationId: string,
  payload: ActivityIngestPayload,
): Promise<ActivityIngestResult> {
  if (payload.occurred_at.getTime() > Date.now() + 5 * 60_000) {
    return { status: "unmatched", reason: "occurred_at futuro: una interacción registrada ya ocurrió." };
  }
  const existing = await db.activity.findFirst({
    where: { externalSource: payload.source, externalId: payload.external_id },
    select: { id: true },
  });
  if (existing) return { status: "duplicate", activityId: existing.id };

  const emails = payload.participants
    .map((participant) => normalizeEmail(participant.email))
    .filter((email): email is string => Boolean(email));
  const phones = payload.participants
    .map((participant) => normalizePhone(participant.phone))
    .filter((phone): phone is string => Boolean(phone));
  const people =
    emails.length || phones.length
      ? await db.person.findMany({
          where: {
            OR: [
              ...(emails.length ? [{ email: { in: emails } }] : []),
              ...(phones.length ? [{ phone: { in: phones } }] : []),
            ],
          },
          select: { id: true, companyId: true },
          take: 20,
        })
      : [];

  const [opportunity, lead, partner, company] = await Promise.all([
    payload.opportunity_id
      ? db.opportunity.findUnique({ where: { id: payload.opportunity_id }, select: { id: true, companyId: true } })
      : null,
    payload.commercial_lead_id
      ? db.commercialLead.findUnique({ where: { id: payload.commercial_lead_id }, select: { id: true, companyId: true } })
      : people.length
        ? db.commercialLead.findFirst({
            where: { personId: { in: people.map((person) => person.id) }, status: { in: ACTIVE_LEAD_STATUSES } },
            select: { id: true, companyId: true },
            orderBy: { updatedAt: "desc" },
          })
        : null,
    payload.commercial_partner_id
      ? db.commercialPartner.findUnique({ where: { id: payload.commercial_partner_id }, select: { id: true, linkedCompanyId: true } })
      : null,
    payload.company_id
      ? db.company.findUnique({ where: { id: payload.company_id }, select: { id: true } })
      : null,
  ]);
  if (payload.opportunity_id && !opportunity) return { status: "unmatched", reason: "opportunity_id no existe" };
  if (payload.commercial_lead_id && !lead) return { status: "unmatched", reason: "commercial_lead_id no existe" };
  if (payload.commercial_partner_id && !partner) return { status: "unmatched", reason: "commercial_partner_id no existe" };
  if (payload.company_id && !company) return { status: "unmatched", reason: "company_id no existe" };

  const companyId =
    company?.id ??
    opportunity?.companyId ??
    lead?.companyId ??
    partner?.linkedCompanyId ??
    people.find((person) => person.companyId)?.companyId ??
    null;
  if (!companyId && !lead && !partner) {
    return { status: "unmatched", reason: "Ningún participante coincide con personas del CRM" };
  }

  try {
    const result = await withOrgTransaction(organizationId, (tx) =>
      insertLoggedActivity(
        tx,
        { organizationId, actorId: null, createdVia: "integration" },
        {
          companyId,
          opportunityId: opportunity?.id ?? null,
          commercialLeadId: lead?.id ?? null,
          commercialPartnerId: partner?.id ?? null,
          personIds: people.map((person) => person.id),
          type: payload.type,
          title: payload.title,
          occurredAt: payload.occurred_at,
          durationMinutes: payload.duration_minutes ?? null,
          channel: payload.source,
          summary: payload.summary ?? null,
          outcomes: payload.outcomes ?? null,
          externalSource: payload.source,
          externalId: payload.external_id,
        },
      ),
    );
    return { status: "created", activityId: result.activityId };
  } catch (error) {
    // Reintento concurrente: la unicidad (org, externalSource, externalId)
    // resuelve la carrera.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.activity.findFirst({
        where: { externalSource: payload.source, externalId: payload.external_id },
        select: { id: true },
      });
      if (duplicate) return { status: "duplicate", activityId: duplicate.id };
    }
    throw error;
  }
}
