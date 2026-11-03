import { z } from "zod";
import { LossReason, type Prisma } from "@prisma/client";
import { defineAgentTool } from "@/lib/agent/tool-definition";
import { registerProposalChange } from "@/lib/agent/proposals";
import type { AgentToolContext } from "@/lib/agent/executor";
import { isoDateString, ID_RULE } from "@/lib/agent/tools/record-lookup";
import { INTERACTION_TYPES } from "@/lib/activity-types";
import { loggedActivityToJson } from "@/lib/crm/activity-records";
import {
  ACTIVE_LEAD_STATUSES,
  LEAD_STATUSES,
  leadStatusLabel,
} from "@/lib/commercial/leads";
import { SOURCE_CHANNELS, sourceChannelLabel } from "@/lib/commercial/attribution";
import { NEXT_STEP_CHANNELS } from "@/lib/commercial/next-action";
import { allianceStageLabel, ALLIANCE_STAGES } from "@/lib/commercial/partners";
import { loadFunnel } from "@/lib/commercial/funnel";
import {
  leadFollowUpSuggestions,
  loadFollowUpRecords,
  opportunityFollowUpSuggestions,
  partnerSuggestions,
} from "@/lib/commercial/follow-up";
import { buildStatusChange, opportunityStatusLabel } from "@/lib/opportunities/status";

const confidenceSchema = z
  .number()
  .min(0)
  .max(1)
  .describe("Tu confianza (0-1) en este cambio; bajala si inferís.");
const evidenceSchema = z
  .string()
  .optional()
  .describe("Cita textual que justifica el cambio (vacío si no hay).");

function iso(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : null;
}

// Prospección, alianzas, estados de oportunidad, próxima acción y funnel.
// Toda escritura pasa por la bitácora reversible (registerProposalChange →
// apply.ts → commercial/ai-items) y respeta el aislamiento por organización
// (ctx.db está scopeado con forOrg).
export function buildCommercialTools(ctx: AgentToolContext) {
  const db = ctx.db;
  return {
    list_commercial_leads: defineAgentTool({
      description: `Lista prospectos y leads (prospección, previo a oportunidad) con filtros por estado, responsable, origen, texto y acción vencida. Devuelve leadId para update_lead_status / convert_lead_to_opportunity. ${ID_RULE}`,
      inputSchema: z.object({
        status: z.array(z.enum(LEAD_STATUSES)).optional().describe("Default: prospect, contacted, lead"),
        ownerId: z.string().optional().describe('userId o "me"'),
        sourceChannel: z.enum(SOURCE_CHANNELS).optional(),
        query: z.string().optional().describe("Texto en título, empresa o persona"),
        overdue: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (args) => {
        const where: Prisma.CommercialLeadWhereInput = {
          status: { in: args.status?.length ? args.status : ACTIVE_LEAD_STATUSES },
          ...(args.ownerId ? { ownerId: args.ownerId === "me" ? ctx.userId : args.ownerId } : {}),
          ...(args.sourceChannel ? { firstTouchAttribution: { sourceChannel: args.sourceChannel } } : {}),
          ...(args.overdue ? { nextStepDueDate: { lt: new Date() } } : {}),
          ...(args.query?.trim()
            ? {
                OR: [
                  { title: { contains: args.query.trim(), mode: "insensitive" } },
                  { company: { name: { contains: args.query.trim(), mode: "insensitive" } } },
                  { person: { lastName: { contains: args.query.trim(), mode: "insensitive" } } },
                  { person: { email: { contains: args.query.trim(), mode: "insensitive" } } },
                ],
              }
            : {}),
        };
        const rows = await db.commercialLead.findMany({
          where,
          take: args.limit ?? 20,
          orderBy: [{ nextStepDueDate: { sort: "asc", nulls: "last" } }, { identifiedAt: "desc" }],
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            identifiedAt: true,
            firstContactAt: true,
            becameLeadAt: true,
            nextStep: true,
            nextStepDueDate: true,
            company: { select: { id: true, name: true } },
            person: { select: { id: true, firstName: true, lastName: true, email: true } },
            owner: { select: { id: true, name: true, email: true } },
            firstTouchAttribution: { select: { sourceChannel: true, sourceDetail: true, campaign: { select: { name: true } }, referrerPartner: { select: { displayName: true } } } },
            _count: { select: { opportunities: true } },
          },
        });
        return {
          count: rows.length,
          leads: rows.map((lead) => ({
            leadId: lead.id,
            title: lead.title,
            status: lead.status,
            statusLabel: leadStatusLabel(lead.status),
            priority: lead.priority,
            company: lead.company,
            person: lead.person,
            owner: lead.owner ? (lead.owner.name ?? lead.owner.email) : null,
            origin: lead.firstTouchAttribution
              ? {
                  channel: sourceChannelLabel(lead.firstTouchAttribution.sourceChannel),
                  campaign: lead.firstTouchAttribution.campaign?.name ?? null,
                  partner: lead.firstTouchAttribution.referrerPartner?.displayName ?? null,
                  detail: lead.firstTouchAttribution.sourceDetail,
                }
              : null,
            identifiedAt: iso(lead.identifiedAt),
            firstContactAt: iso(lead.firstContactAt),
            becameLeadAt: iso(lead.becameLeadAt),
            nextStep: lead.nextStep,
            nextStepDueDate: iso(lead.nextStepDueDate),
            opportunities: lead._count.opportunities,
          })),
        };
      },
    }),

    get_commercial_origin: defineAgentTool({
      description: "Devuelve el origen comercial (primer toque y toque más reciente: canal, campaña, referidor, UTM) de un lead u oportunidad.",
      inputSchema: z.object({
        entity: z.enum(["commercial_lead", "opportunity"]),
        id: z.string().min(1),
      }),
      execute: async ({ entity, id }) => {
        const select = {
          sourceChannel: true,
          sourceDetail: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          landingPage: true,
          touchedAt: true,
          method: true,
          campaign: { select: { name: true, key: true } },
          referrerPerson: { select: { id: true, firstName: true, lastName: true } },
          referrerPartner: { select: { id: true, displayName: true } },
        } as const;
        if (entity === "commercial_lead") {
          const lead = await db.commercialLead.findUnique({
            where: { id },
            select: { firstTouchAttribution: { select }, lastTouchAttribution: { select }, inboundLeadId: true },
          });
          if (!lead) return { error: `Prospecto no encontrado: ${id}` };
          return { firstTouch: lead.firstTouchAttribution, lastTouch: lead.lastTouchAttribution, inboundLeadId: lead.inboundLeadId };
        }
        const opportunity = await db.opportunity.findUnique({
          where: { id },
          select: { source: true, firstTouchAttribution: { select }, commercialLead: { select: { id: true, title: true } } },
        });
        if (!opportunity) return { error: `Oportunidad no encontrada: ${id}` };
        return {
          firstTouch: opportunity.firstTouchAttribution,
          legacySource: opportunity.source,
          originLead: opportunity.commercialLead,
        };
      },
    }),

    list_partners: defineAgentTool({
      description: "Lista alianzas comerciales (pipeline de partners) con etapa, estado, responsable, próxima acción y resultados (referidos, oportunidades, ganadas).",
      inputSchema: z.object({
        stage: z.enum(ALLIANCE_STAGES).optional(),
        status: z.enum(["open", "paused", "discarded"]).optional(),
        query: z.string().optional(),
      }),
      execute: async (args) => {
        const partners = await db.commercialPartner.findMany({
          where: {
            ...(args.stage ? { allianceStage: args.stage } : {}),
            ...(args.status ? { allianceStatus: args.status } : {}),
            ...(args.query?.trim() ? { displayName: { contains: args.query.trim(), mode: "insensitive" } } : {}),
          },
          take: 50,
          orderBy: { displayName: "asc" },
          select: {
            id: true,
            displayName: true,
            kind: true,
            allianceStage: true,
            allianceStatus: true,
            allianceType: true,
            nextStep: true,
            nextStepDueDate: true,
            agreementTerms: true,
            owner: { select: { name: true, email: true } },
            _count: { select: { referredAttributions: true, opportunityAssignments: true } },
            opportunityAssignments: { where: { opportunity: { status: "won" } }, select: { id: true } },
          },
        });
        return {
          partners: partners.map((partner) => ({
            partnerId: partner.id,
            name: partner.displayName,
            stage: partner.allianceStage,
            stageLabel: allianceStageLabel(partner.allianceStage),
            status: partner.allianceStatus,
            type: partner.allianceType,
            owner: partner.owner ? (partner.owner.name ?? partner.owner.email) : null,
            nextStep: partner.nextStep,
            nextStepDueDate: iso(partner.nextStepDueDate),
            hasAgreement: Boolean(partner.agreementTerms),
            referrals: partner._count.referredAttributions,
            opportunities: partner._count.opportunityAssignments,
            wonOpportunities: partner.opportunityAssignments.length,
          })),
        };
      },
    }),

    get_commercial_funnel: defineAgentTool({
      description: "Métricas del funnel comercial completo para un período: volumen (prospectos, contactados, leads, oportunidades, calificadas, propuestas, ganadas/perdidas), conversión por cohorte, tiempos entre etapas, pipeline abierto/ponderado, seguimiento faltante y desgloses por responsable, origen, campaña y partner.",
      inputSchema: z.object({
        from: isoDateString("Inicio del período (YYYY-MM-DD)").optional(),
        to: isoDateString("Fin del período (YYYY-MM-DD)").optional(),
      }),
      execute: async ({ from, to }) => {
        const end = to ? new Date(`${to.slice(0, 10)}T23:59:59.999Z`) : new Date();
        const start = from ? new Date(from) : new Date(end.getTime() - 90 * 86_400_000);
        const report = await loadFunnel(db, { from: start, to: end });
        return {
          period: { from: iso(start), to: iso(end) },
          volume: report.volume,
          cohort: report.cohort,
          durations: report.durations,
          pipeline: report.pipeline,
          sprint0: report.sprint0,
          bySource: report.bySource.slice(0, 10),
          byOwner: report.byOwner.slice(0, 10),
          byCampaign: report.byCampaign.slice(0, 10),
          byPartner: report.byPartner.slice(0, 10),
          note: "Conversiones por cohorte de creación en el período; montos estimados (no facturación).",
        };
      },
    }),

    suggest_next_actions: defineAgentTool({
      description: "Sugerencias determinísticas de próxima mejor acción (reglas: propuesta sin respuesta, acción vencida, lead sin responsable, contactado sin respuesta, pausa por reactivar, reunión sin próximo paso). Con entity+id evalúa una ficha; sin id devuelve las oportunidades abiertas del usuario que requieren atención. Son sugerencias: no ejecutan nada.",
      inputSchema: z.object({
        entity: z.enum(["opportunity", "commercial_lead", "commercial_partner"]).optional(),
        id: z.string().optional(),
      }),
      execute: async ({ entity, id }) => {
        if (entity && id) {
          const records = await loadFollowUpRecords(db, entity, id);
          if (entity === "opportunity") {
            const opportunity = await db.opportunity.findUnique({ where: { id }, include: { stage: { select: { key: true } } } });
            if (!opportunity) return { error: `Oportunidad no encontrada: ${id}` };
            return { current: { nextStep: opportunity.nextStep, nextStepDueDate: iso(opportunity.nextStepDueDate) }, suggestions: await opportunityFollowUpSuggestions(db, opportunity, records) };
          }
          if (entity === "commercial_lead") {
            const lead = await db.commercialLead.findUnique({ where: { id }, include: { _count: { select: { opportunities: true } } } });
            if (!lead) return { error: `Prospecto no encontrado: ${id}` };
            return { current: { nextStep: lead.nextStep, nextStepDueDate: iso(lead.nextStepDueDate) }, suggestions: leadFollowUpSuggestions(lead, records) };
          }
          const partner = await db.commercialPartner.findUnique({ where: { id } });
          if (!partner) return { error: `Partner no encontrado: ${id}` };
          return { current: { nextStep: partner.nextStep, nextStepDueDate: iso(partner.nextStepDueDate) }, suggestions: partnerSuggestions(partner) };
        }
        const opportunities = await db.opportunity.findMany({
          where: {
            status: { in: ["open", "paused"] },
            ownerId: ctx.userId,
            OR: [
              { nextStep: null },
              { nextStepDueDate: null },
              { nextStepDueDate: { lt: new Date() } },
              { status: "paused", reactivateAt: { lte: new Date() } },
              { stage: { key: "propuesta_principal" } },
            ],
          },
          include: { stage: { select: { key: true } }, company: { select: { name: true } } },
          take: 15,
        });
        const result = [];
        for (const opportunity of opportunities) {
          const records = await loadFollowUpRecords(db, "opportunity", opportunity.id);
          const suggestions = await opportunityFollowUpSuggestions(db, opportunity, records);
          if (suggestions.length) {
            result.push({ opportunityId: opportunity.id, name: opportunity.name, company: opportunity.company.name, suggestions });
          }
        }
        return { opportunities: result };
      },
    }),

    create_prospect: defineAgentTool({
      description: `Crea un prospecto (o directamente un lead si manifestó interés) en Prospección, sin crear oportunidad. Reutiliza empresa/persona existentes (dedup por email o nombre). Registra el origen comercial (canal, campaña, referidor) sin inventarlo. ${ID_RULE}`,
      inputSchema: z.object({
        companyId: z.string().optional().describe("Empresa existente"),
        companyName: z.string().optional().describe("Empresa nueva (si no existe)"),
        personId: z.string().optional().describe("Persona existente"),
        person: z
          .object({
            firstName: z.string().min(1),
            lastName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            roleTitle: z.string().optional(),
            linkedinUrl: z.string().optional(),
          })
          .optional(),
        title: z.string().optional(),
        status: z.enum(["prospect", "contacted", "lead"]).optional(),
        interestSignal: z.string().optional().describe("Obligatorio si status=lead"),
        contactAttempt: z
          .object({
            type: z.enum(INTERACTION_TYPES),
            occurredAt: isoDateString("Cuándo ocurrió"),
            summary: z.string().optional(),
          })
          .optional()
          .describe("Obligatorio si status=contacted"),
        ownerId: z.string().optional().describe('userId o "me" (default: usuario actual)'),
        priority: z.enum(["low", "medium", "high"]).optional(),
        description: z.string().optional(),
        sourceChannel: z.enum(SOURCE_CHANNELS).optional(),
        campaignId: z.string().optional(),
        referrerPersonId: z.string().optional(),
        referrerPartnerId: z.string().optional(),
        sourceDetail: z.string().optional(),
        nextStep: z.string().optional(),
        nextStepDueDate: isoDateString("Fecha de la próxima acción").optional(),
        nextStepChannel: z.enum(NEXT_STEP_CHANNELS).optional(),
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ reason, confidence, evidence, ownerId, sourceChannel, campaignId, referrerPersonId, referrerPartnerId, sourceDetail, ...input }) => {
        if (!input.companyId && !input.companyName && !input.personId && !input.person) {
          return { error: "Indicá al menos una empresa o una persona." };
        }
        if (input.status === "lead" && !input.interestSignal) {
          return { error: "Para crearlo como lead indicá interestSignal (qué interés o necesidad manifestó)." };
        }
        if (input.status === "contacted" && !input.contactAttempt) {
          return { error: "Para crearlo como contactado indicá contactAttempt (canal y fecha)." };
        }
        const afterValue = {
          ...input,
          ownerId: ownerId === "me" || !ownerId ? ctx.userId : ownerId,
          attribution: { sourceChannel, campaignId, referrerPersonId, referrerPartnerId, sourceDetail },
        };
        const label = input.title ?? [input.companyName, input.person ? `${input.person.firstName} ${input.person.lastName ?? ""}`.trim() : null].filter(Boolean).join(" · ");
        return registerProposalChange(ctx, { companyId: input.companyId ?? null }, [
          {
            type: "add_commercial_lead",
            entity: "commercial_lead",
            entityId: null,
            beforeValue: null,
            afterValue: JSON.parse(JSON.stringify(afterValue)),
            explanation: reason,
            confidence,
            evidence: evidence ?? null,
            label: `Nuevo ${input.status === "lead" ? "lead" : "prospecto"}`,
            before: "—",
            after: `${label || "Prospecto"}${sourceChannel ? ` · ${sourceChannelLabel(sourceChannel)}` : ""}`,
          },
        ]);
      },
    }),

    update_lead_status: defineAgentTool({
      description: `Avanza o retrocede un prospecto: contacted (requiere contactAttempt o una interacción ya registrada; un intento NO es una respuesta positiva), lead (requiere interestSignal), disqualified (requiere reason) o prospect. Para crear la oportunidad usá convert_lead_to_opportunity. ${ID_RULE}`,
      inputSchema: z.object({
        leadId: z.string().min(1),
        status: z.enum(["prospect", "contacted", "lead", "disqualified"]),
        reason: z.string().optional(),
        interestSignal: z.string().optional(),
        contactAttempt: z
          .object({
            type: z.enum(INTERACTION_TYPES),
            occurredAt: isoDateString("Cuándo ocurrió"),
            summary: z.string().optional(),
            outcomes: z.string().optional(),
          })
          .optional(),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ leadId, confidence, evidence, ...input }) => {
        const lead = await db.commercialLead.findUnique({ where: { id: leadId }, select: { id: true, title: true, status: true, companyId: true } });
        if (!lead) return { error: `Prospecto no encontrado: ${leadId}` };
        return registerProposalChange(ctx, { companyId: lead.companyId }, [
          {
            type: "commercial_lead_status",
            entity: "commercial_lead",
            entityId: lead.id,
            beforeValue: { status: lead.status },
            afterValue: JSON.parse(JSON.stringify(input)),
            explanation: input.reason ?? input.interestSignal ?? "Cambio de estado del prospecto.",
            confidence,
            evidence: evidence ?? null,
            label: `Estado de "${lead.title}"`,
            before: leadStatusLabel(lead.status),
            after: leadStatusLabel(input.status),
          },
        ]);
      },
    }),

    convert_lead_to_opportunity: defineAgentTool({
      description: `Crea una oportunidad (en Discovery / Sprint 0) a partir de un lead cuando existe un proyecto concreto. Conserva el origen del lead y lo marca convertido; un lead puede originar varias oportunidades. Un prospecto sin interés no se convierte. ${ID_RULE}`,
      inputSchema: z.object({
        leadId: z.string().min(1),
        name: z.string().min(1),
        companyId: z.string().optional().describe("Solo si el lead no tiene empresa"),
        mainPain: z.string().optional(),
        situation: z.string().optional(),
        estimatedValue: z.number().nonnegative().optional(),
        ownerId: z.string().optional(),
        nextStep: z.string().optional(),
        nextStepDueDate: isoDateString("Fecha del próximo paso").optional(),
        reason: z.string().min(1),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ leadId, reason, confidence, evidence, ...input }) => {
        const lead = await db.commercialLead.findUnique({ where: { id: leadId }, select: { id: true, title: true, status: true, companyId: true } });
        if (!lead) return { error: `Prospecto no encontrado: ${leadId}` };
        if (lead.status === "prospect" || lead.status === "contacted") {
          return { error: "Todavía no es lead: registrá primero la señal de interés con update_lead_status (status=lead)." };
        }
        return registerProposalChange(ctx, { companyId: lead.companyId ?? input.companyId ?? null }, [
          {
            type: "convert_lead",
            entity: "commercial_lead",
            entityId: lead.id,
            beforeValue: { status: lead.status },
            afterValue: JSON.parse(JSON.stringify(input)),
            explanation: reason,
            confidence,
            evidence: evidence ?? null,
            label: `Oportunidad desde "${lead.title}"`,
            before: leadStatusLabel(lead.status),
            after: `${input.name} (Discovery / Sprint 0)`,
          },
        ]);
      },
    }),

    set_opportunity_status: defineAgentTool({
      description: "Cambia el estado de una oportunidad: paused (reason + reactivateAt o reactivationCriteria; conserva su etapa), won (wonEvidence verificable: contrato, OC, aceptación escrita), lost (lossReason) u open (reactivar/reabrir; reason si estaba cerrada). Ganar no implica que esté pagada. Usalo solo si el usuario lo pide explícitamente.",
      inputSchema: z.object({
        opportunityId: z.string().min(1),
        status: z.enum(["open", "paused", "won", "lost"]),
        reason: z.string().optional(),
        reactivateAt: isoDateString("Fecha de reactivación").optional(),
        reactivationCriteria: z.string().optional(),
        wonEvidence: z.string().optional(),
        closedAt: isoDateString("Fecha de cierre (no futura)").optional(),
        lossReason: z.nativeEnum(LossReason).optional(),
        lossDetail: z.string().optional(),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ opportunityId, confidence, evidence, ...input }) => {
        const opportunity = await db.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true, name: true, status: true, companyId: true } });
        if (!opportunity) return { error: `Oportunidad no encontrada: ${opportunityId}` };
        // Valida antes de registrar para devolver un error corregible.
        const check = buildStatusChange(opportunity, {
          ...input,
          reactivateAt: input.reactivateAt ? new Date(input.reactivateAt) : null,
          closedAt: input.closedAt ? new Date(input.closedAt) : null,
        }, ctx.userId);
        if (!check.ok) return { error: check.error };
        return registerProposalChange(ctx, { companyId: opportunity.companyId, opportunityId }, [
          {
            type: "status_change",
            entity: "opportunity",
            entityId: opportunityId,
            beforeValue: { status: opportunity.status },
            afterValue: JSON.parse(JSON.stringify(input)),
            explanation: input.reason ?? input.wonEvidence ?? input.lossDetail ?? "Cambio de estado.",
            confidence,
            evidence: evidence ?? null,
            label: `Estado de "${opportunity.name}"`,
            before: opportunityStatusLabel(opportunity.status),
            after: opportunityStatusLabel(input.status),
          },
        ]);
      },
    }),

    set_next_action: defineAgentTool({
      description: `Define o actualiza la próxima acción confirmada (acción concreta, fecha, canal, motivo) de una oportunidad, prospecto o alianza. Solo registra el compromiso: no envía mensajes. ${ID_RULE}`,
      inputSchema: z.object({
        entity: z.enum(["opportunity", "commercial_lead", "commercial_partner"]),
        id: z.string().min(1),
        nextStep: z.string().min(1),
        nextStepDueDate: isoDateString("Fecha (YYYY-MM-DD)"),
        nextStepChannel: z.enum(NEXT_STEP_CHANNELS).optional(),
        nextStepContext: z.string().optional().describe("Motivo o contexto"),
        confidence: confidenceSchema,
        evidence: evidenceSchema,
      }),
      execute: async ({ entity, id, confidence, evidence, ...input }) => {
        const record =
          entity === "opportunity"
            ? await db.opportunity.findUnique({ where: { id }, select: { companyId: true, nextStep: true, name: true } })
            : entity === "commercial_lead"
              ? await db.commercialLead.findUnique({ where: { id }, select: { companyId: true, nextStep: true, title: true } })
              : await db.commercialPartner.findUnique({ where: { id }, select: { linkedCompanyId: true, nextStep: true, displayName: true } });
        if (!record) return { error: `Registro no encontrado: ${id}` };
        const companyId = "companyId" in record ? record.companyId : record.linkedCompanyId;
        const name = "name" in record ? record.name : "title" in record ? record.title : record.displayName;
        return registerProposalChange(
          ctx,
          { companyId, opportunityId: entity === "opportunity" ? id : null },
          [
            {
              type: "set_next_action",
              entity,
              entityId: id,
              beforeValue: { nextStep: record.nextStep },
              afterValue: JSON.parse(JSON.stringify(input)),
              explanation: input.nextStepContext ?? "Próxima acción definida desde el chat.",
              confidence,
              evidence: evidence ?? null,
              label: `Próxima acción de "${name}"`,
              before: record.nextStep ?? "—",
              after: `${input.nextStep} (${input.nextStepDueDate.slice(0, 10)})`,
            },
          ],
        );
      },
    }),

    log_interaction: defineAgentTool({
      description: `Registra una interacción que YA ocurrió (email, WhatsApp, llamada, LinkedIn, reunión) con un prospecto, alianza u oportunidad, aunque no tenga empresa. Para algo futuro usá create_task. ${ID_RULE}`,
      inputSchema: z.object({
        commercialLeadId: z.string().optional(),
        commercialPartnerId: z.string().optional(),
        opportunityId: z.string().optional(),
        personIds: z.array(z.string()).max(20).optional(),
        type: z.enum(INTERACTION_TYPES),
        title: z.string().min(1),
        date: isoDateString("Cuándo ocurrió"),
        summary: z.string().optional(),
        outcomes: z.string().optional(),
      }),
      execute: async (args) => {
        if (!args.commercialLeadId && !args.commercialPartnerId && !args.opportunityId) {
          return { error: "Indicá commercialLeadId, commercialPartnerId u opportunityId." };
        }
        const occurredAt = new Date(args.date);
        if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
          return { error: "La fecha es futura: para algo pendiente usá create_task." };
        }
        const [lead, partner, opportunity] = await Promise.all([
          args.commercialLeadId ? db.commercialLead.findUnique({ where: { id: args.commercialLeadId }, select: { companyId: true, personId: true } }) : null,
          args.commercialPartnerId ? db.commercialPartner.findUnique({ where: { id: args.commercialPartnerId }, select: { linkedCompanyId: true } }) : null,
          args.opportunityId ? db.opportunity.findUnique({ where: { id: args.opportunityId }, select: { companyId: true } }) : null,
        ]);
        if (args.commercialLeadId && !lead) return { error: `Prospecto no encontrado: ${args.commercialLeadId}` };
        if (args.commercialPartnerId && !partner) return { error: `Partner no encontrado: ${args.commercialPartnerId}` };
        if (args.opportunityId && !opportunity) return { error: `Oportunidad no encontrada: ${args.opportunityId}` };
        const personIds = [...new Set([...(args.personIds ?? []), ...(lead?.personId ? [lead.personId] : [])])];
        if (personIds.length) {
          const found = await db.person.count({ where: { id: { in: personIds } } });
          if (found !== personIds.length) return { error: "Alguna persona no existe." };
        }
        const companyId = opportunity?.companyId ?? lead?.companyId ?? partner?.linkedCompanyId ?? null;
        return registerProposalChange(ctx, { companyId, opportunityId: args.opportunityId ?? null }, [
          {
            type: "log_activity",
            entity: "activity",
            entityId: null,
            beforeValue: null,
            afterValue: loggedActivityToJson({
              companyId,
              opportunityId: args.opportunityId ?? null,
              commercialLeadId: args.commercialLeadId ?? null,
              commercialPartnerId: args.commercialPartnerId ?? null,
              personIds,
              type: args.type,
              title: args.title,
              occurredAt,
              durationMinutes: null,
              channel: null,
              summary: args.summary ?? null,
              outcomes: args.outcomes ?? null,
            }),
            explanation: "Interacción registrada por el copiloto.",
            confidence: 1,
            evidence: null,
            label: `${args.type}: ${args.title}`,
            before: "—",
            after: occurredAt.toISOString().slice(0, 10),
          },
        ]);
      },
    }),
  };
}
