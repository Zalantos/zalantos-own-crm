import type { Prisma } from "@prisma/client";
import { withOrgTransaction } from "@/lib/tenant";
import { appendTimelineEvent } from "@/lib/timeline";
import {
  findExistingPerson,
  normalizeEmail,
  normalizePersonName,
} from "@/lib/crm/person-dedup";
import { insertLoggedActivity } from "@/lib/crm/activity-records";
import { isInteractionType, type InteractionType } from "@/lib/activity-types";
import {
  createAttribution,
  hasAttributionData,
  type AttributionInput,
} from "@/lib/commercial/attribution";
import { recordStageTransition, recordStatusChange } from "@/lib/commercial/history";
import { checkStageTransition } from "@/lib/opportunities/stage-gates";
import type { CommercialContext, ServiceResult } from "@/lib/commercial/opportunity-service";

type Tx = Prisma.TransactionClient;

// Prospecto → Contactado → Lead → (Oportunidad). Un prospecto NO demostró
// interés; contactado = hubo un intento de contacto (no una respuesta);
// lead = señal de interés o necesidad reconocible.
export const LEAD_STATUSES = [
  "prospect",
  "contacted",
  "lead",
  "converted",
  "disqualified",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  prospect: "Prospecto",
  contacted: "Contactado",
  lead: "Lead",
  converted: "Convertido",
  disqualified: "Descartado",
};

export const ACTIVE_LEAD_STATUSES: LeadStatus[] = ["prospect", "contacted", "lead"];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function leadStatusLabel(value: string) {
  return isLeadStatus(value) ? LEAD_STATUS_LABELS[value] : value;
}

export const LEAD_PRIORITIES = ["low", "medium", "high"] as const;

export type LeadStatusChangeInput = {
  status: LeadStatus;
  reason?: string | null;
  // lead: qué manifestó / necesidad identificada (obligatorio).
  interestSignal?: string | null;
  // contacted: el intento de contacto que lo justifica (si no existe ya una
  // actividad registrada del lead).
  at?: Date;
};

export type LeadStatusData = {
  status: LeadStatus;
  statusChangedAt: Date;
  firstContactAt?: Date;
  becameLeadAt?: Date;
  interestSignal?: string;
  disqualifiedAt?: Date | null;
  disqualificationReason?: string | null;
};

type LeadSnapshot = {
  status: string;
  firstContactAt: Date | null;
  becameLeadAt: Date | null;
};

// Transiciones válidas (puras). "converted" solo se alcanza creando una
// oportunidad (convertLeadToOpportunity).
const ALLOWED: Record<LeadStatus, LeadStatus[]> = {
  prospect: ["contacted", "lead", "disqualified"],
  contacted: ["prospect", "lead", "disqualified"],
  lead: ["contacted", "disqualified"],
  converted: [],
  disqualified: ["prospect", "contacted", "lead"],
};

export function buildLeadStatusChange(
  current: LeadSnapshot,
  input: LeadStatusChangeInput,
  hasContactEvidence: boolean,
): { ok: true; data: LeadStatusData } | { ok: false; error: string } {
  if (!isLeadStatus(current.status)) {
    return { ok: false, error: `Estado actual desconocido: ${current.status}` };
  }
  if (input.status === "converted") {
    return { ok: false, error: "Para convertir un lead creá una oportunidad desde la ficha." };
  }
  if (!ALLOWED[current.status].includes(input.status)) {
    return {
      ok: false,
      error: `No se puede pasar de ${LEAD_STATUS_LABELS[current.status]} a ${LEAD_STATUS_LABELS[input.status]}.`,
    };
  }
  const at = input.at ?? new Date();
  const data: LeadStatusData = {
    status: input.status,
    statusChangedAt: at,
    disqualifiedAt: null,
    disqualificationReason: null,
  };
  switch (input.status) {
    case "contacted":
      if (!hasContactEvidence) {
        return {
          ok: false,
          error: "Registra el intento de contacto (canal y fecha) para marcarlo como contactado.",
        };
      }
      if (!current.firstContactAt) data.firstContactAt = at;
      break;
    case "lead": {
      const signal = input.interestSignal?.trim();
      if (!signal) {
        return {
          ok: false,
          error: "Describe la señal de interés o la necesidad identificada para convertirlo en lead.",
        };
      }
      data.interestSignal = signal;
      if (!current.becameLeadAt) data.becameLeadAt = at;
      break;
    }
    case "disqualified": {
      const reason = input.reason?.trim();
      if (!reason) return { ok: false, error: "Indica el motivo del descarte." };
      data.disqualifiedAt = at;
      data.disqualificationReason = reason;
      break;
    }
    case "prospect":
      break;
  }
  return { ok: true, data };
}

export type ContactAttemptInput = {
  type: InteractionType;
  occurredAt: Date;
  title?: string | null;
  summary?: string | null;
  outcomes?: string | null;
};

export type CreateLeadInput = {
  title?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  personId?: string | null;
  person?: {
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    roleTitle?: string | null;
    linkedinUrl?: string | null;
  } | null;
  status?: "prospect" | "contacted" | "lead";
  ownerId?: string | null;
  priority?: string | null;
  description?: string | null;
  interestSignal?: string | null;
  identifiedAt?: Date | null;
  attribution?: AttributionInput | null;
  // Reusa una atribución existente (inbound) en vez de crear otra.
  attributionId?: string | null;
  inboundLeadId?: string | null;
  nextStep?: string | null;
  nextStepDueDate?: Date | null;
  nextStepChannel?: string | null;
  contactAttempt?: ContactAttemptInput | null;
};

async function assertActiveUser(tx: Tx, organizationId: string, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, organizationId, isActive: true },
    select: { id: true },
  });
  if (!user) throw new Error("El responsable seleccionado no es válido.");
}

async function ensureRelationship(
  tx: Tx,
  organizationId: string,
  personId: string,
  companyId: string,
) {
  const existing = await tx.personCompanyRelationship.findUnique({
    where: { personId_companyId: { personId, companyId } },
    select: { id: true },
  });
  if (existing) return;
  const person = await tx.person.findFirst({
    where: { id: personId, organizationId },
    select: { companyId: true },
  });
  await tx.personCompanyRelationship.create({
    data: {
      organizationId,
      personId,
      companyId,
      roles: ["contact"],
      isPrimary: !person?.companyId,
    },
  });
  if (!person?.companyId) {
    await tx.person.update({
      where: { id: personId, organizationId },
      data: { companyId },
    });
  }
}

// Crea el lead en una transacción abierta. Reutiliza empresa/persona
// existentes (dedup estándar del CRM) y rechaza un segundo lead activo para
// la misma persona (o para la misma empresa sin persona). Un advisory lock
// serializa creaciones concurrentes del mismo sujeto.
export async function createCommercialLeadTx(
  tx: Tx,
  ctx: { organizationId: string; actorId: string; createdVia: string },
  input: CreateLeadInput,
) {
  const organizationId = ctx.organizationId;
  const status = input.status ?? "prospect";
  if (status === "lead" && !input.interestSignal?.trim()) {
    throw new Error("Un lead requiere la señal de interés o necesidad identificada.");
  }
  if (status === "contacted" && !input.contactAttempt) {
    throw new Error("Para crearlo como contactado registra el intento de contacto.");
  }
  if (input.ownerId) await assertActiveUser(tx, organizationId, input.ownerId);

  // ---- Empresa
  let createdCompanyId: string | null = null;
  let createdPersonId: string | null = null;
  let companyId: string | null = null;
  let companyName: string | null = null;
  if (input.companyId) {
    const company = await tx.company.findFirst({
      where: { id: input.companyId, organizationId },
      select: { id: true, name: true },
    });
    if (!company) throw new Error("La empresa seleccionada no existe.");
    companyId = company.id;
    companyName = company.name;
  } else if (input.companyName?.trim()) {
    const name = input.companyName.trim();
    const existing = await tx.company.findFirst({
      where: { organizationId, name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    const company =
      existing ??
      (await tx.company.create({
        data: {
          organizationId,
          name,
          createdById: ctx.actorId,
          createdVia: ctx.createdVia,
        },
        select: { id: true, name: true },
      }));
    if (!existing) {
      createdCompanyId = company.id;
      await appendTimelineEvent(tx, {
        organizationId,
        companyId: company.id,
        type: "company_created",
        title: `Empresa creada: ${company.name}`,
        actorId: ctx.actorId,
      });
    }
    companyId = company.id;
    companyName = company.name;
  }

  // ---- Persona
  let personId: string | null = null;
  let personName: string | null = null;
  if (input.personId) {
    const person = await tx.person.findFirst({
      where: { id: input.personId, organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!person) throw new Error("La persona seleccionada no existe.");
    personId = person.id;
    personName = `${person.firstName} ${person.lastName}`.trim();
  } else if (input.person?.firstName?.trim()) {
    const firstName = normalizePersonName(input.person.firstName);
    const lastName = normalizePersonName(input.person.lastName);
    const email = normalizeEmail(input.person.email);
    const match = await findExistingPerson(tx, organizationId, {
      companyId,
      email,
      firstName,
      lastName,
    });
    if (match) {
      personId = match.id;
      personName = `${match.firstName} ${match.lastName}`.trim();
    } else {
      const person = await tx.person.create({
        data: {
          organizationId,
          companyId,
          firstName,
          lastName,
          email,
          phone: input.person.phone?.trim() || null,
          roleTitle: input.person.roleTitle?.trim() || null,
          linkedinUrl: input.person.linkedinUrl?.trim() || null,
          createdById: ctx.actorId,
          createdVia: ctx.createdVia,
        },
        select: { id: true },
      });
      personId = person.id;
      createdPersonId = person.id;
      personName = `${firstName} ${lastName}`.trim();
      if (companyId) {
        await tx.personCompanyRelationship.create({
          data: { organizationId, personId, companyId, roles: ["contact"], isPrimary: true },
        });
      }
    }
  }
  if (personId && companyId) await ensureRelationship(tx, organizationId, personId, companyId);
  if (!personId && !companyId) {
    throw new Error("Un prospecto necesita al menos una empresa o una persona.");
  }

  // ---- Dedupe de leads activos del mismo sujeto
  const lockKey = `commercial_lead:${organizationId}:${personId ?? `company:${companyId}`}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  const duplicate = await tx.commercialLead.findFirst({
    where: {
      organizationId,
      status: { in: ACTIVE_LEAD_STATUSES },
      ...(personId ? { personId } : { companyId, personId: null }),
    },
    select: { id: true, title: true },
  });
  if (duplicate) {
    throw new DuplicateLeadError(duplicate.id, duplicate.title);
  }

  // ---- Atribución (primer toque)
  let attributionId = input.attributionId ?? null;
  if (!attributionId && input.attribution && hasAttributionData(input.attribution)) {
    const attribution = await createAttribution(
      tx,
      { organizationId, actorId: ctx.actorId, method: ctx.createdVia === "agent" ? "agent" : "manual" },
      input.attribution,
    );
    attributionId = attribution.id;
  }

  const identifiedAt = input.identifiedAt ?? new Date();
  const title =
    input.title?.trim() ||
    [companyName, personName].filter(Boolean).join(" · ") ||
    "Prospecto";
  const lead = await tx.commercialLead.create({
    data: {
      organizationId,
      title,
      companyId,
      personId,
      status,
      priority: input.priority ?? null,
      ownerId: input.ownerId ?? ctx.actorId,
      description: input.description?.trim() || null,
      interestSignal: input.interestSignal?.trim() || null,
      identifiedAt,
      becameLeadAt: status === "lead" ? identifiedAt : null,
      statusChangedAt: identifiedAt,
      firstTouchAttributionId: attributionId,
      lastTouchAttributionId: attributionId,
      inboundLeadId: input.inboundLeadId ?? null,
      nextStep: input.nextStep?.trim() || null,
      nextStepDueDate: input.nextStepDueDate ?? null,
      nextStepChannel: input.nextStepChannel ?? null,
      nextStepUpdatedAt: input.nextStep ? new Date() : null,
      createdById: ctx.actorId,
      createdVia: ctx.createdVia,
    },
    select: { id: true, title: true, companyId: true, personId: true, status: true },
  });
  await recordStatusChange(tx, {
    organizationId,
    entityType: "commercial_lead",
    entityId: lead.id,
    fromValue: null,
    toValue: status,
    actorId: ctx.actorId,
    source: ctx.createdVia,
  });

  let contactActivityId: string | null = null;
  if (input.contactAttempt) {
    const logged = await logLeadInteractionTx(tx, ctx, { ...lead, personId }, input.contactAttempt);
    contactActivityId = logged.activityId;
    await tx.commercialLead.update({
      where: { id: lead.id, organizationId },
      data: { firstContactAt: input.contactAttempt.occurredAt },
    });
  }

  await appendTimelineEvent(tx, {
    organizationId,
    companyId,
    type: "lead_created",
    title: `${LEAD_STATUS_LABELS[status]} creado: ${title}`,
    refType: "commercial_lead",
    refId: lead.id,
    actorId: ctx.actorId,
  });
  return { ...lead, createdCompanyId, createdPersonId, contactActivityId, attributionId };
}

export class DuplicateLeadError extends Error {
  constructor(
    public readonly leadId: string,
    title: string,
  ) {
    super(`Ya existe un prospecto/lead activo para este contacto: "${title}" (id: ${leadId}).`);
  }
}

export async function logLeadInteractionTx(
  tx: Tx,
  ctx: { organizationId: string; actorId: string; createdVia: string },
  lead: { id: string; title: string; companyId: string | null; personId: string | null },
  attempt: ContactAttemptInput,
) {
  if (!isInteractionType(attempt.type)) throw new Error("Canal de interacción inválido.");
  return insertLoggedActivity(
    tx,
    { organizationId: ctx.organizationId, actorId: ctx.actorId, createdVia: ctx.createdVia },
    {
      companyId: lead.companyId,
      opportunityId: null,
      commercialLeadId: lead.id,
      personIds: lead.personId ? [lead.personId] : [],
      type: attempt.type,
      title: attempt.title?.trim() || `Contacto con ${lead.title}`,
      occurredAt: attempt.occurredAt,
      durationMinutes: null,
      channel: null,
      summary: attempt.summary?.trim() || null,
      outcomes: attempt.outcomes?.trim() || null,
    },
  );
}

export async function createCommercialLead(
  ctx: CommercialContext,
  input: CreateLeadInput,
): Promise<ServiceResult<{ id: string }> & { duplicateOfId?: string }> {
  try {
    const lead = await withOrgTransaction(ctx.organizationId, (tx) =>
      createCommercialLeadTx(
        tx,
        { organizationId: ctx.organizationId, actorId: ctx.actorId, createdVia: ctx.source },
        input,
      ),
    );
    return { ok: true, value: { id: lead.id } };
  } catch (error) {
    if (error instanceof DuplicateLeadError) {
      return { ok: false, error: error.message, duplicateOfId: error.leadId };
    }
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo crear el prospecto." };
  }
}

export async function changeLeadStatusTx(
  tx: Tx,
  ctx: { organizationId: string; actorId: string; createdVia: string },
  leadId: string,
  input: LeadStatusChangeInput & { contactAttempt?: ContactAttemptInput | null },
) {
  const lead = await tx.commercialLead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId },
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      personId: true,
      firstContactAt: true,
      becameLeadAt: true,
    },
  });
  if (!lead) throw new Error("Prospecto no encontrado");

  let hasContactEvidence = Boolean(input.contactAttempt);
  if (!hasContactEvidence && input.status === "contacted") {
    hasContactEvidence = Boolean(
      await tx.activity.findFirst({
        where: {
          organizationId: ctx.organizationId,
          commercialLeadId: lead.id,
          occurredAt: { not: null },
        },
        select: { id: true },
      }),
    );
  }
  const at = input.contactAttempt?.occurredAt ?? input.at;
  const result = buildLeadStatusChange(lead, { ...input, at }, hasContactEvidence);
  if (!result.ok) throw new Error(result.error);

  const logged = input.contactAttempt
    ? await logLeadInteractionTx(tx, ctx, lead, input.contactAttempt)
    : null;
  await tx.commercialLead.update({
    where: { id: lead.id, organizationId: ctx.organizationId },
    data: result.data,
  });
  await recordStatusChange(tx, {
    organizationId: ctx.organizationId,
    entityType: "commercial_lead",
    entityId: lead.id,
    fromValue: lead.status,
    toValue: result.data.status,
    actorId: ctx.actorId,
    source: ctx.createdVia,
    reason: input.reason ?? input.interestSignal ?? null,
    at: result.data.statusChangedAt,
  });
  await appendTimelineEvent(tx, {
    organizationId: ctx.organizationId,
    companyId: lead.companyId,
    type: "lead_status_changed",
    title: `${lead.title}: ${leadStatusLabel(lead.status)} → ${leadStatusLabel(result.data.status)}`,
    summary: input.reason ?? input.interestSignal ?? null,
    refType: "commercial_lead",
    refId: lead.id,
    actorId: ctx.actorId,
  });
  return { from: lead.status, to: result.data.status, loggedActivity: logged };
}

export async function changeLeadStatus(
  ctx: CommercialContext,
  leadId: string,
  input: LeadStatusChangeInput & { contactAttempt?: ContactAttemptInput | null },
): Promise<ServiceResult<{ from: string; to: string }>> {
  try {
    const { from, to } = await withOrgTransaction(ctx.organizationId, (tx) =>
      changeLeadStatusTx(
        tx,
        { organizationId: ctx.organizationId, actorId: ctx.actorId, createdVia: ctx.source },
        leadId,
        input,
      ),
    );
    return { ok: true, value: { from, to } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo cambiar el estado." };
  }
}

export type ConvertLeadToOpportunityInput = {
  name: string;
  companyId?: string | null;
  mainPain?: string | null;
  situation?: string | null;
  estimatedValue?: number | null;
  ownerId?: string | null;
  nextStep?: string | null;
  nextStepDueDate?: Date | null;
  stageKey?: string | null;
};

// Crea una oportunidad a partir del lead, en Discovery por defecto. El lead
// conserva su historia y puede originar más oportunidades; el primer toque
// (atribución) se comparte, nunca se copia ni se sobrescribe.
export async function convertLeadToOpportunityTx(
  tx: Tx,
  ctx: { organizationId: string; actorId: string; createdVia: string },
  leadId: string,
  input: ConvertLeadToOpportunityInput,
) {
  const organizationId = ctx.organizationId;
  const lead = await tx.commercialLead.findFirst({
    where: { id: leadId, organizationId },
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      personId: true,
      ownerId: true,
      firstTouchAttributionId: true,
      firstTouchAttribution: { select: { sourceChannel: true, sourceDetail: true } },
    },
  });
  if (!lead) throw new Error("Prospecto no encontrado");
  if (lead.status === "disqualified") {
    throw new Error("El prospecto está descartado: reactivalo antes de crear una oportunidad.");
  }
  if (lead.status === "prospect") {
    throw new Error(
      "Un prospecto sin interés manifestado no es una oportunidad: primero registralo como lead.",
    );
  }
  const companyId = input.companyId ?? lead.companyId;
  if (!companyId) throw new Error("La oportunidad necesita una empresa: vinculá una al lead.");
  const company = await tx.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("La empresa seleccionada no existe.");
  if (lead.personId) await ensureRelationship(tx, organizationId, lead.personId, company.id);
  if (!lead.companyId) {
    await tx.commercialLead.update({
      where: { id: lead.id, organizationId },
      data: { companyId: company.id },
    });
  }

  const ownerId = input.ownerId ?? lead.ownerId ?? ctx.actorId;
  await assertActiveUser(tx, organizationId, ownerId);
  const stage = await tx.pipelineStage.findFirst({
    where: {
      organizationId,
      isActive: true,
      isWon: false,
      isLost: false,
      ...(input.stageKey ? { key: input.stageKey } : {}),
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, label: true },
  });
  if (!stage) throw new Error("La organización no tiene etapas activas.");
  // Crear directamente en una etapa avanzada exige las mismas compuertas que
  // avanzar desde Discovery (una oportunidad nueva no tiene propuesta).
  const gate = checkStageTransition(null, stage.key, {
    status: "open",
    mainPain: input.mainPain ?? null,
    proposalDecisionAt: null,
    proposalSentAt: null,
    hasSentOffer: false,
    hasInteractionAfterProposal: false,
  });
  if (!gate.ok) throw new Error(gate.error);

  const opportunity = await tx.opportunity.create({
    data: {
      organizationId,
      companyId: company.id,
      name: input.name.trim(),
      stageId: stage.id,
      status: "open",
      mainPain: input.mainPain?.trim() || null,
      situation: input.situation?.trim() || null,
      estimatedValue: input.estimatedValue ?? null,
      decisionMakerId: lead.personId,
      ownerId,
      commercialLeadId: lead.id,
      firstTouchAttributionId: lead.firstTouchAttributionId,
      source: lead.firstTouchAttribution?.sourceDetail ?? lead.firstTouchAttribution?.sourceChannel ?? null,
      nextStep: input.nextStep?.trim() || null,
      nextStepDueDate: input.nextStepDueDate ?? null,
      nextStepUpdatedAt: input.nextStep ? new Date() : null,
      statusChangedAt: new Date(),
      createdById: ctx.actorId,
      createdVia: ctx.createdVia,
    },
    select: { id: true, name: true },
  });
  await recordStageTransition(tx, {
    organizationId,
    opportunityId: opportunity.id,
    stage,
    actorId: ctx.actorId,
    source: "lead_conversion",
  });
  if (lead.status !== "converted") {
    const now = new Date();
    await tx.commercialLead.update({
      where: { id: lead.id, organizationId },
      data: { status: "converted", convertedAt: now, statusChangedAt: now },
    });
    await recordStatusChange(tx, {
      organizationId,
      entityType: "commercial_lead",
      entityId: lead.id,
      fromValue: lead.status,
      toValue: "converted",
      actorId: ctx.actorId,
      source: ctx.createdVia,
      metadata: { opportunityId: opportunity.id },
      at: now,
    });
  }
  await appendTimelineEvent(tx, {
    organizationId,
    companyId: company.id,
    opportunityId: opportunity.id,
    type: "opportunity_created",
    title: `Oportunidad creada: ${opportunity.name}`,
    summary: `Desde el lead "${lead.title}" · ${stage.label}`,
    refType: "commercial_lead",
    refId: lead.id,
    actorId: ctx.actorId,
  });
  return {
    opportunityId: opportunity.id,
    stage,
    previousLead: { status: lead.status, companyId: lead.companyId },
  };
}

export async function convertLeadToOpportunity(
  ctx: CommercialContext,
  leadId: string,
  input: ConvertLeadToOpportunityInput,
): Promise<ServiceResult<{ opportunityId: string }>> {
  if (!input.name.trim()) return { ok: false, error: "El nombre de la oportunidad es obligatorio." };
  try {
    const result = await withOrgTransaction(ctx.organizationId, (tx) =>
      convertLeadToOpportunityTx(
        tx,
        { organizationId: ctx.organizationId, actorId: ctx.actorId, createdVia: ctx.source },
        leadId,
        input,
      ),
    );
    return { ok: true, value: { opportunityId: result.opportunityId } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo crear la oportunidad." };
  }
}
