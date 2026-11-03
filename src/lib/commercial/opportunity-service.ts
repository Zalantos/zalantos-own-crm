import type { Prisma } from "@prisma/client";
import { withOrgTransaction, type TenantClient } from "@/lib/tenant";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";
import {
  getOrgStages,
  resolveStage,
  LEGACY_STAGE_ACTIONS,
  type StageOption,
} from "@/lib/pipeline/stages";
import {
  checkStageTransition,
  type StageGateFacts,
} from "@/lib/opportunities/stage-gates";
import {
  buildStatusChange,
  opportunityStatusLabel,
  type StatusChangeInput,
} from "@/lib/opportunities/status";
import { recordStageTransition, recordStatusChange } from "@/lib/commercial/history";
import { isNextStepChannel } from "@/lib/commercial/next-action";

type Tx = Prisma.TransactionClient;

export type CommercialContext = {
  db: TenantClient;
  organizationId: string;
  actorId: string;
  // manual | agent | meeting | workflow | inbound_lead | ...
  source: string;
};

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function loadStageGateFacts(
  tx: Tx,
  organizationId: string,
  opportunity: {
    id: string;
    status: string;
    mainPain: string | null;
    proposalDecisionAt: Date | null;
    proposalSentAt: Date | null;
  },
): Promise<StageGateFacts> {
  const sentOffer = await tx.commercialOffer.findFirst({
    where: { organizationId, opportunityId: opportunity.id, sentAt: { not: null } },
    orderBy: { sentAt: "asc" },
    select: { sentAt: true },
  });
  const proposalAt = opportunity.proposalSentAt ?? sentOffer?.sentAt ?? null;
  const since = proposalAt ?? new Date(0);
  // Secuencial: dentro de una transacción no se lanzan consultas en paralelo
  // sobre la misma conexión.
  const interaction = await tx.activity.findFirst({
    where: {
      organizationId,
      opportunityId: opportunity.id,
      occurredAt: { gte: since },
    },
    select: { id: true },
  });
  const meeting = interaction
    ? null
    : await tx.meeting.findFirst({
        where: { organizationId, opportunityId: opportunity.id, meetingDate: { gte: since } },
        select: { id: true },
      });
  return {
    status: opportunity.status,
    mainPain: opportunity.mainPain,
    proposalDecisionAt: opportunity.proposalDecisionAt,
    proposalSentAt: opportunity.proposalSentAt,
    hasSentOffer: Boolean(sentOffer),
    hasInteractionAfterProposal: Boolean(proposalAt && (interaction || meeting)),
  };
}

// Cambio de etapa dentro de una transacción ya abierta: valida compuertas,
// escribe historial y timeline. Lo usan la UI, el agente/MCP (vía apply.ts)
// y la conversión de leads. Lanza Error con mensaje legible si no procede.
export async function applyStageChangeTx(
  tx: Tx,
  input: {
    organizationId: string;
    opportunityId: string;
    target: StageOption;
    actorId: string | null;
    source: string;
    reason?: string | null;
    timelineBase?: Record<string, unknown>;
    skipGates?: boolean;
  },
): Promise<{ from: StageOption | { id: string; key: string; label: string }; to: StageOption }> {
  const opportunity = await tx.opportunity.findFirst({
    where: { id: input.opportunityId, organizationId: input.organizationId },
    select: {
      id: true,
      companyId: true,
      status: true,
      mainPain: true,
      proposalDecisionAt: true,
      proposalSentAt: true,
      stage: { select: { id: true, key: true, label: true } },
    },
  });
  if (!opportunity) throw new Error("Oportunidad no encontrada");
  if (opportunity.stage.id === input.target.id) {
    return { from: opportunity.stage, to: input.target };
  }
  if (!input.skipGates) {
    const facts = await loadStageGateFacts(tx, input.organizationId, opportunity);
    const gate = checkStageTransition(opportunity.stage.key, input.target.key, facts);
    if (!gate.ok) throw new Error(gate.error);
  }
  await tx.opportunity.update({
    where: { id: opportunity.id, organizationId: input.organizationId },
    data: { stageId: input.target.id },
  });
  await recordStageTransition(tx, {
    organizationId: input.organizationId,
    opportunityId: opportunity.id,
    stage: input.target,
    actorId: input.actorId,
    source: input.source,
    reason: input.reason,
  });
  await appendTimelineEvent(tx, {
    organizationId: input.organizationId,
    companyId: opportunity.companyId,
    opportunityId: opportunity.id,
    type: "stage_changed",
    title: "Cambio de etapa",
    summary: `${opportunity.stage.label} → ${input.target.label}`,
    actorId: input.actorId,
    ...(input.timelineBase ?? {}),
  });
  return { from: opportunity.stage, to: input.target };
}

export async function changeOpportunityStage(
  ctx: CommercialContext,
  input: { opportunityId: string; stage: string; reason?: string | null },
): Promise<ServiceResult<{ fromKey: string; toKey: string }>> {
  const stages = await getOrgStages(ctx.db);
  const target = resolveStage(stages, input.stage);
  if (!target) {
    const legacy = LEGACY_STAGE_ACTIONS[input.stage.trim().toLowerCase()];
    return {
      ok: false,
      error: legacy ?? `Etapa inválida "${input.stage}". Etapas válidas: ${stages.map((s) => s.key).join(", ")}`,
    };
  }
  if (target.isWon || target.isLost) {
    return {
      ok: false,
      error: "Para cerrar una oportunidad usá Marcar ganada / perdida (requiere evidencia o motivo).",
    };
  }
  try {
    const change = await withOrgTransaction(ctx.organizationId, (tx) =>
      applyStageChangeTx(tx, {
        organizationId: ctx.organizationId,
        opportunityId: input.opportunityId,
        target,
        actorId: ctx.actorId,
        source: ctx.source,
        reason: input.reason,
      }),
    );
    if (change.from.id !== change.to.id) {
      await evaluateWorkflows(ctx.db, ctx.organizationId, {
        entityType: "opportunity",
        entityId: input.opportunityId,
        eventName: "stage_changed",
        actorId: ctx.actorId,
        before: { stage: change.from.id, stageKey: change.from.key },
        after: { stage: change.to.id, stageKey: change.to.key },
      });
    }
    return { ok: true, value: { fromKey: change.from.key, toKey: change.to.key } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo cambiar la etapa." };
  }
}

// Cambio de estado (open/paused/won/lost) en una transacción abierta. Cierra
// el período de etapa al salir de "open" y abre uno nuevo al volver, para que
// el tiempo pausado no cuente como tiempo en etapa.
export async function applyStatusChangeTx(
  tx: Tx,
  input: {
    organizationId: string;
    opportunityId: string;
    change: StatusChangeInput;
    actorId: string | null;
    source: string;
    timelineBase?: Record<string, unknown>;
  },
) {
  const opportunity = await tx.opportunity.findFirst({
    where: { id: input.opportunityId, organizationId: input.organizationId },
    select: {
      id: true,
      companyId: true,
      status: true,
      ownerId: true,
      stage: { select: { id: true, key: true, label: true, isActive: true } },
    },
  });
  if (!opportunity) throw new Error("Oportunidad no encontrada");
  const result = buildStatusChange(opportunity, input.change, input.actorId);
  if (!result.ok) throw new Error(result.error);
  if (result.data.status === "open" && !opportunity.ownerId) {
    throw new Error("Una oportunidad activa debe tener responsable: asigná uno antes de reabrirla.");
  }
  if (result.data.status === "open" && !opportunity.stage.isActive) {
    throw new Error(
      `La etapa "${opportunity.stage.label}" está retirada: elegí una etapa activa al reactivar.`,
    );
  }

  const now = result.data.statusChangedAt;
  await tx.opportunity.update({
    where: { id: opportunity.id, organizationId: input.organizationId },
    data: result.data,
  });
  if (opportunity.status === "open") {
    await tx.opportunityStageHistory.updateMany({
      where: { organizationId: input.organizationId, opportunityId: opportunity.id, exitedAt: null },
      data: { exitedAt: now },
    });
  }
  if (result.data.status === "open") {
    await recordStageTransition(tx, {
      organizationId: input.organizationId,
      opportunityId: opportunity.id,
      stage: opportunity.stage,
      actorId: input.actorId,
      source: input.source,
      reason: input.change.reason ?? "Reactivación",
      at: now,
    });
  }
  await recordStatusChange(tx, {
    organizationId: input.organizationId,
    entityType: "opportunity",
    entityId: opportunity.id,
    fromValue: opportunity.status,
    toValue: result.data.status,
    actorId: input.actorId,
    source: input.source,
    reason:
      input.change.reason ??
      result.data.pauseReason ??
      result.data.wonEvidence ??
      result.data.lossReason ??
      null,
    metadata: { stageKey: opportunity.stage.key },
    at: now,
  });
  await appendTimelineEvent(tx, {
    organizationId: input.organizationId,
    companyId: opportunity.companyId,
    opportunityId: opportunity.id,
    type: "status_changed",
    title: `Estado: ${opportunityStatusLabel(opportunity.status)} → ${opportunityStatusLabel(result.data.status)}`,
    summary:
      result.data.pauseReason ?? result.data.wonEvidence ?? result.data.lossDetail ?? input.change.reason ?? null,
    actorId: input.actorId,
    ...(input.timelineBase ?? {}),
  });
  return { from: opportunity.status, to: result.data.status, previous: opportunity };
}

export async function changeOpportunityStatus(
  ctx: CommercialContext,
  opportunityId: string,
  change: StatusChangeInput & { reactivateStageId?: string | null },
): Promise<ServiceResult<{ from: string; to: string }>> {
  try {
    const result = await withOrgTransaction(ctx.organizationId, async (tx) => {
      // Reactivar una pausada cuya etapa fue retirada: primero se reubica.
      if (change.status === "open" && change.reactivateStageId) {
        const stage = await tx.pipelineStage.findFirst({
          where: {
            id: change.reactivateStageId,
            organizationId: ctx.organizationId,
            isActive: true,
            isWon: false,
            isLost: false,
          },
          select: { id: true, key: true, label: true },
        });
        if (!stage) throw new Error("Etapa de reactivación inválida.");
        await tx.opportunity.update({
          where: { id: opportunityId, organizationId: ctx.organizationId },
          data: { stageId: stage.id },
        });
      }
      return applyStatusChangeTx(tx, {
        organizationId: ctx.organizationId,
        opportunityId,
        change,
        actorId: ctx.actorId,
        source: ctx.source,
      });
    });
    await evaluateWorkflows(ctx.db, ctx.organizationId, {
      entityType: "opportunity",
      entityId: opportunityId,
      eventName: "status_changed",
      actorId: ctx.actorId,
      before: { status: result.from },
      after: { status: result.to },
    });
    return { ok: true, value: { from: result.from, to: result.to } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo cambiar el estado." };
  }
}

export async function recordProposalSent(
  ctx: CommercialContext,
  input: {
    opportunityId: string;
    sentAt: Date;
    expectedResponseAt?: Date | null;
    decisionOnly?: boolean;
  },
): Promise<ServiceResult<null>> {
  if (input.sentAt.getTime() > Date.now() + 60_000) {
    return { ok: false, error: "La fecha de envío no puede ser futura." };
  }
  const opportunity = await ctx.db.opportunity.findUnique({
    where: { id: input.opportunityId },
    select: { id: true, companyId: true, proposalDecisionAt: true },
  });
  if (!opportunity) return { ok: false, error: "Oportunidad no encontrada" };
  await ctx.db.opportunity.update({
    where: { id: opportunity.id },
    data: input.decisionOnly
      ? { proposalDecisionAt: input.sentAt }
      : {
          proposalDecisionAt: opportunity.proposalDecisionAt ?? input.sentAt,
          proposalSentAt: input.sentAt,
          expectedResponseAt: input.expectedResponseAt ?? null,
        },
  });
  await appendTimelineEvent(ctx.db, {
    organizationId: ctx.organizationId,
    companyId: opportunity.companyId,
    opportunityId: opportunity.id,
    type: input.decisionOnly ? "proposal_decided" : "proposal_sent",
    title: input.decisionOnly
      ? "Decisión: preparar/enviar propuesta"
      : "Propuesta enviada al cliente",
    summary: input.expectedResponseAt
      ? `Respuesta esperada ${input.expectedResponseAt.toISOString().slice(0, 10)}`
      : null,
    actorId: ctx.actorId,
  });
  return { ok: true, value: null };
}

export type NextActionInput = {
  nextStep: string | null;
  nextStepDueDate: Date | null;
  nextStepChannel: string | null;
  nextStepContext: string | null;
  nextStepActivityId: string | null;
};

export type NextActionEntity = "opportunity" | "commercial_lead" | "commercial_partner";

// Próxima acción unificada para oportunidad, lead y partner (mismas
// columnas). La tarea asociada debe pertenecer a la org y a la entidad.
export async function updateNextAction(
  ctx: CommercialContext,
  entity: NextActionEntity,
  entityId: string,
  input: NextActionInput,
): Promise<ServiceResult<null>> {
  if (input.nextStepChannel && !isNextStepChannel(input.nextStepChannel)) {
    return { ok: false, error: "Canal de próxima acción inválido." };
  }
  if (input.nextStepActivityId) {
    const link =
      entity === "opportunity"
        ? { opportunityId: entityId }
        : entity === "commercial_lead"
          ? { commercialLeadId: entityId }
          : { commercialPartnerId: entityId };
    const task = await ctx.db.activity.findFirst({
      where: { id: input.nextStepActivityId, occurredAt: null, ...link },
      select: { id: true },
    });
    if (!task) return { ok: false, error: "La tarea seleccionada no pertenece a este registro." };
  }
  const data = {
    nextStep: input.nextStep?.trim() || null,
    nextStepDueDate: input.nextStepDueDate,
    nextStepChannel: input.nextStepChannel,
    nextStepContext: input.nextStepContext?.trim() || null,
    nextStepActivityId: input.nextStepActivityId,
    nextStepUpdatedAt: new Date(),
  };
  try {
    if (entity === "opportunity") {
      const opportunity = await ctx.db.opportunity.update({
        where: { id: entityId },
        data,
        select: { id: true, companyId: true, nextStep: true },
      });
      await appendTimelineEvent(ctx.db, {
        organizationId: ctx.organizationId,
        companyId: opportunity.companyId,
        opportunityId: opportunity.id,
        type: "next_step_updated",
        title: "Próximo paso actualizado",
        summary: opportunity.nextStep,
        actorId: ctx.actorId,
      });
    } else if (entity === "commercial_lead") {
      await ctx.db.commercialLead.update({ where: { id: entityId }, data });
    } else {
      await ctx.db.commercialPartner.update({ where: { id: entityId }, data });
    }
    return { ok: true, value: null };
  } catch {
    return { ok: false, error: "Registro no encontrado." };
  }
}
