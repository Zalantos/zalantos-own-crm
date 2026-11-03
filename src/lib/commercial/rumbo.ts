import type { Prisma } from "@prisma/client";
import { dispatchIntegrationEvent } from "@/lib/integrations/gateway";
import { appendTimelineEvent } from "@/lib/timeline";
import type { OrgSettings, TenantClient } from "@/lib/tenant";
import type { ServiceResult } from "@/lib/commercial/opportunity-service";

// Traspaso CRM → Rumbo. No existe un contrato consumible de Rumbo en este
// repo, así que el CRM prepara un payload versionado, lo despacha por el
// gateway de integraciones (n8n) y espera confirmación explícita en
// POST /api/integrations/rumbo/handoff-status. "sent" = el gateway aceptó el
// evento; solo "confirmed" significa que Rumbo creó el proyecto.
export const RUMBO_HANDOFF_PAYLOAD_VERSION = "2026-11-01";
export const RUMBO_HANDOFF_EVENT = "rumbo.project_handoff";

export const RUMBO_HANDOFF_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  sent: "Enviado (esperando confirmación de Rumbo)",
  confirmed: "Confirmado por Rumbo",
  failed: "Fallido",
};

export type HandoffSource = {
  organization: { id: string; name: string; slug: string };
  opportunity: {
    id: string;
    name: string;
    status: string;
    wonAt: Date | null;
    wonEvidence: string | null;
    estimatedValue: Prisma.Decimal | null;
    recurringValue: Prisma.Decimal | null;
    mainPain: string | null;
    situation: string | null;
    impact: string | null;
    nextStep: string | null;
  };
  company: { id: string; name: string; website: string | null };
  owner: { id: string; name: string | null; email: string } | null;
  decisionMaker: { name: string; email: string | null } | null;
  sponsor: { name: string; email: string | null } | null;
  acceptedOffer: {
    id: string;
    versionNumber: number;
    status: string;
    productName: string | null;
    pricingUnit: string;
    economicBaseNetAmount: Prisma.Decimal | null;
    solutionSummary: string | null;
    implementationPlan: string | null;
    outOfScope: string | null;
    commercialTerms: string | null;
    documents: { name: string; externalUrl: string | null }[];
  } | null;
  handoff: { projectName: string; startDate: Date | null; scopeSummary: string | null; responsibleUserId: string | null };
  crmUrl: string;
};

// Payload puro y versionado (documentado en docs/integrations/rumbo-handoff.md).
// No incluye tareas comerciales: Rumbo gestiona la ejecución.
export function buildRumboHandoffPayload(source: HandoffSource) {
  const offer = source.acceptedOffer;
  return {
    version: RUMBO_HANDOFF_PAYLOAD_VERSION,
    organization: source.organization,
    client: source.company,
    opportunity: {
      id: source.opportunity.id,
      name: source.opportunity.name,
      url: source.crmUrl,
      wonAt: source.opportunity.wonAt?.toISOString() ?? null,
      commitmentEvidence: source.opportunity.wonEvidence,
      estimatedImplementationValue: source.opportunity.estimatedValue?.toString() ?? null,
      estimatedMonthlyRecurringValue: source.opportunity.recurringValue?.toString() ?? null,
    },
    project: {
      name: source.handoff.projectName,
      startDate: source.handoff.startDate?.toISOString().slice(0, 10) ?? null,
      agreedScope: source.handoff.scopeSummary ?? offer?.solutionSummary ?? null,
      responsibleUserId: source.handoff.responsibleUserId,
    },
    context: {
      pain: source.opportunity.mainPain,
      situation: source.opportunity.situation,
      impact: source.opportunity.impact,
      lastCommercialNextStep: source.opportunity.nextStep,
    },
    people: {
      commercialOwner: source.owner,
      decisionMaker: source.decisionMaker,
      sponsor: source.sponsor,
    },
    commercialOffer: offer
      ? {
          id: offer.id,
          version: offer.versionNumber,
          status: offer.status,
          productName: offer.productName,
          pricingUnit: offer.pricingUnit,
          netAmount: offer.economicBaseNetAmount?.toString() ?? null,
          implementationPlan: offer.implementationPlan,
          outOfScope: offer.outOfScope,
          commercialTerms: offer.commercialTerms,
          documents: offer.documents,
        }
      : null,
  };
}

function appUrl() {
  return (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function requestRumboHandoff(
  db: TenantClient,
  org: OrgSettings,
  actorId: string,
  input: {
    opportunityId: string;
    projectName: string;
    startDate: Date | null;
    scopeSummary: string | null;
    responsibleUserId: string | null;
  },
): Promise<ServiceResult<{ status: string; handoffId: string }>> {
  const opportunity = await db.opportunity.findUnique({
    where: { id: input.opportunityId },
    include: {
      company: { select: { id: true, name: true, website: true } },
      owner: { select: { id: true, name: true, email: true } },
      decisionMaker: { select: { firstName: true, lastName: true, email: true } },
      sponsor: { select: { firstName: true, lastName: true, email: true } },
      commercialOffers: {
        where: { status: { in: ["accepted", "sent"] } },
        orderBy: [{ status: "asc" }, { versionNumber: "desc" }],
        take: 1,
        include: { documents: { select: { name: true, externalUrl: true } } },
      },
      rumboHandoff: true,
    },
  });
  if (!opportunity) return { ok: false, error: "Oportunidad no encontrada" };
  if (opportunity.status !== "won") {
    return { ok: false, error: "Solo se traspasan a Rumbo oportunidades ganadas." };
  }
  if (opportunity.rumboHandoff?.status === "confirmed") {
    return { ok: false, error: "Rumbo ya confirmó este proyecto; no se reenvía para evitar duplicados." };
  }
  if (!input.projectName.trim()) return { ok: false, error: "Indica el nombre del proyecto." };
  if (input.responsibleUserId) {
    const user = await db.user.findFirst({
      where: { id: input.responsibleUserId, isActive: true },
      select: { id: true },
    });
    if (!user) return { ok: false, error: "El responsable seleccionado no es válido." };
  }

  const person = (p: { firstName: string; lastName: string; email: string | null } | null) =>
    p ? { name: `${p.firstName} ${p.lastName}`.trim(), email: p.email } : null;
  const payload = buildRumboHandoffPayload({
    organization: { id: org.id, name: org.name, slug: org.slug },
    opportunity,
    company: opportunity.company,
    owner: opportunity.owner,
    decisionMaker: person(opportunity.decisionMaker),
    sponsor: person(opportunity.sponsor),
    acceptedOffer: opportunity.commercialOffers[0] ?? null,
    handoff: input,
    crmUrl: `${appUrl()}/opportunities/${opportunity.id}`,
  });

  // Una fila por oportunidad: reintentos reusan la misma (y el mismo
  // dedupeKey del gateway), así Rumbo puede deduplicar por handoffId.
  const handoff = await db.rumboHandoff.upsert({
    where: { opportunityId: opportunity.id },
    update: {
      status: "pending",
      payloadVersion: RUMBO_HANDOFF_PAYLOAD_VERSION,
      payload: payload as Prisma.InputJsonValue,
      projectName: input.projectName.trim(),
      startDate: input.startDate,
      scopeSummary: input.scopeSummary,
      responsibleUserId: input.responsibleUserId,
      requestedById: actorId,
      attempts: { increment: 1 },
      lastError: null,
    },
    create: {
      organizationId: org.id,
      opportunityId: opportunity.id,
      status: "pending",
      payloadVersion: RUMBO_HANDOFF_PAYLOAD_VERSION,
      payload: payload as Prisma.InputJsonValue,
      projectName: input.projectName.trim(),
      startDate: input.startDate,
      scopeSummary: input.scopeSummary,
      responsibleUserId: input.responsibleUserId,
      requestedById: actorId,
      attempts: 1,
    },
  });

  const dispatch = await dispatchIntegrationEvent(db, org, {
    type: RUMBO_HANDOFF_EVENT,
    channel: "rumbo",
    entityType: "opportunity",
    entityId: opportunity.id,
    recipient: { system: "rumbo" },
    // Mismo dedupeKey por intento: si el gateway ya lo aceptó no se reenvía.
    dedupeKey: `${RUMBO_HANDOFF_EVENT}:${handoff.id}:${handoff.attempts}`,
    payload: { handoffId: handoff.id, ...payload },
  });

  const status = dispatch.status === "failed" ? "failed" : "sent";
  await db.rumboHandoff.update({
    where: { id: handoff.id },
    data: {
      status,
      integrationDeliveryId: dispatch.deliveryId,
      ...(status === "sent" ? { sentAt: new Date() } : { failedAt: new Date() }),
      lastError: dispatch.status === "failed" ? dispatch.error : null,
    },
  });
  await appendTimelineEvent(db, {
    organizationId: org.id,
    companyId: opportunity.companyId,
    opportunityId: opportunity.id,
    type: "rumbo_handoff",
    title:
      status === "sent"
        ? "Traspaso a Rumbo enviado (pendiente de confirmación)"
        : "Traspaso a Rumbo fallido",
    summary: dispatch.status === "failed" ? dispatch.error : input.projectName,
    refType: "rumbo_handoff",
    refId: handoff.id,
    actorId,
  });
  return { ok: true, value: { status, handoffId: handoff.id } };
}
