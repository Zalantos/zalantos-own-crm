import type { Prisma } from "@prisma/client";
import { withOrgTransaction, type TenantClient } from "@/lib/tenant";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";
import { getOrgStages, stagesByKey, type StageOption } from "@/lib/pipeline/stages";
import {
  coerceFieldValue,
  getWritableFields,
  resolveField,
  type AgentEntity,
} from "@/lib/agent/field-registry";
import { upsertCustomFieldValue } from "@/lib/custom-fields/merge";

type ApplyContext = {
  db: TenantClient;
  organizationId: string;
  // Etapas activas de la org, indexadas por key (los items guardan keys).
  stages: Map<string, StageOption>;
  companyId: string;
  // Fallback opportunity for items that don't target one explicitly
  // (the meeting's opportunity, or the one the chat proposal was scoped to).
  defaultOpportunityId: string | null;
  // Where the proposal came from, for timeline copy ("Reunión X" | "Chat del agente").
  originLabel: string;
  proposalId: string;
  actorId: string;
};

type ItemRecord = {
  id: string;
  type: string;
  entity: string;
  entityId: string | null;
  beforeValue: Prisma.JsonValue;
  afterValue: Prisma.JsonValue;
  approved: boolean;
  status: string;
};

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveStage(ctx: ApplyContext, value: unknown): StageOption {
  const stage = ctx.stages.get(String(value));
  if (!stage) {
    throw new Error(`Etapa inválida: ${String(value)}`);
  }
  return stage;
}

function stageLabel(ctx: ApplyContext, value: unknown): string {
  if (value == null) return "—";
  return ctx.stages.get(String(value))?.label ?? String(value);
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function asAgentEntity(entity: string): AgentEntity {
  if (entity === "company" || entity === "opportunity" || entity === "person") {
    return entity;
  }
  throw new Error(`Entidad no soportada: ${entity}`);
}

// Person refs proposed by the model must exist and belong to the company.
async function assertPersonInCompany(
  tx: Prisma.TransactionClient,
  ctx: ApplyContext,
  personId: string,
): Promise<void> {
  const person = await tx.person.findFirst({
    where: { id: personId, companyId: ctx.companyId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!person) {
    throw new Error(
      `La persona ${personId} no existe o no pertenece a la empresa`,
    );
  }
}

const ENTITY_LABELS: Record<string, string> = {
  company: "empresa",
  opportunity: "oportunidad",
  person: "contacto",
};

// Writes one field on one entity. Field names, types and coercion come from
// the field registry (static columns + "custom.<name>" custom fields), so
// anything off-registry is refused with "Campo no permitido".
async function applyFieldUpdate(
  tx: Prisma.TransactionClient,
  item: ItemRecord,
  ctx: ApplyContext,
  field: string,
  value: unknown,
): Promise<void> {
  const entity = asAgentEntity(item.entity);
  const fields = await getWritableFields(ctx.db, entity);
  const spec = resolveField(fields, entity, field);
  const coerced = coerceFieldValue(spec, field, value);

  const entityId =
    item.entityId ?? (entity === "company" ? ctx.companyId : null);
  if (!entityId) {
    throw new Error(`Falta ${ENTITY_LABELS[entity]} destino`);
  }

  if (spec.customDefinition) {
    await upsertCustomFieldValue(
      tx,
      ctx.organizationId,
      entity,
      entityId,
      spec.customDefinition,
      coerced,
    );
    return;
  }

  if (spec.type === "personRef" && coerced != null) {
    await assertPersonInCompany(tx, ctx, String(coerced));
  }

  // "stage" en oportunidades viaja como key de PipelineStage y se persiste
  // como FK (stageId).
  if (entity === "opportunity" && field === "stage") {
    const stage = resolveStage(ctx, coerced);
    await tx.opportunity.update({
      where: { id: entityId, organizationId: ctx.organizationId },
      data: { stageId: stage.id },
    });
    return;
  }

  const data = { [field]: coerced };
  switch (entity) {
    case "company":
      await tx.company.update({
        where: { id: entityId, organizationId: ctx.organizationId },
        data,
      });
      break;
    case "opportunity":
      await tx.opportunity.update({
        where: { id: entityId, organizationId: ctx.organizationId },
        data,
      });
      break;
    case "person":
      await tx.person.update({
        where: { id: entityId, organizationId: ctx.organizationId },
        data,
      });
      break;
  }
}

// Applies one item, throwing on any problem so the caller can mark it failed
// without touching sibling items. Writes a granular timeline event in the same
// transaction as the CRM change it describes.
async function applyItem(
  tx: Prisma.TransactionClient,
  item: ItemRecord,
  ctx: ApplyContext,
): Promise<void> {
  const after = asRecord(item.afterValue);
  const before = asRecord(item.beforeValue);

  const timelineBase = {
    organizationId: ctx.organizationId,
    companyId: ctx.companyId,
    opportunityId:
      item.entity === "opportunity" && item.entityId
        ? item.entityId
        : ctx.defaultOpportunityId,
    refType: "proposal",
    refId: ctx.proposalId,
    actorId: ctx.actorId,
    metadata: {
      itemId: item.id,
      itemType: item.type,
      originLabel: ctx.originLabel,
    },
  };

  switch (item.type) {
    case "update_field": {
      const field = String(after.field);
      const value = after.value;
      await applyFieldUpdate(tx, item, ctx, field, value);

      const isStage = item.entity === "opportunity" && field === "stage";
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: isStage ? "stage_changed" : "field_updated",
        title: isStage
          ? "Cambio de etapa"
          : `Campo actualizado en ${ENTITY_LABELS[item.entity] ?? item.entity}: ${field}`,
        summary: isStage
          ? `${stageLabel(ctx, before.value)} → ${stageLabel(ctx, value)}`
          : `${formatValue(before.value)} → ${formatValue(value)}`,
      });
      break;
    }

    case "update_pain": {
      if (!item.entityId) throw new Error("Falta oportunidad destino");
      await tx.opportunity.update({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        data: { mainPain: String(after.value ?? "") },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "field_updated",
        title: "Dolor principal actualizado",
        summary: String(after.value ?? ""),
      });
      break;
    }

    case "update_next_step": {
      if (!item.entityId) throw new Error("Falta oportunidad destino");
      const dueDate = after.nextStepDueDate
        ? new Date(String(after.nextStepDueDate))
        : null;
      await tx.opportunity.update({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        data: {
          nextStep: String(after.nextStep ?? ""),
          nextStepDueDate: dueDate,
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "next_step_updated",
        title: "Próximo paso actualizado",
        summary: `${String(after.nextStep ?? "")}${dueDate ? ` (vence ${dueDate.toLocaleDateString("es-AR")})` : ""}`,
      });
      break;
    }

    case "stage_change": {
      if (!item.entityId) throw new Error("Falta oportunidad destino");
      const stage = resolveStage(ctx, after.value);
      await tx.opportunity.update({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        data: { stageId: stage.id },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "stage_changed",
        title: "Cambio de etapa",
        summary: `${stageLabel(ctx, before.value)} → ${stage.label}`,
      });
      break;
    }

    case "add_contact": {
      const person = await tx.person.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: ctx.companyId,
          firstName: String(after.firstName ?? "").trim() || "Sin nombre",
          lastName: String(after.lastName ?? ""),
          email: after.email ? String(after.email) : null,
          phone: after.phone ? String(after.phone) : null,
          roleTitle: after.roleTitle ? String(after.roleTitle) : null,
          linkedinUrl: after.linkedinUrl ? String(after.linkedinUrl) : null,
          notes: after.notes ? String(after.notes) : null,
          isDecisionMaker: Boolean(after.isDecisionMaker),
          isSponsor: Boolean(after.isSponsor),
        },
      });
      // A flagged new contact also gets linked on the target opportunity so
      // decisionMaker/sponsor don't stay stale after the review.
      if (
        ctx.defaultOpportunityId &&
        (person.isDecisionMaker || person.isSponsor)
      ) {
        await tx.opportunity.update({
          where: {
            id: ctx.defaultOpportunityId,
            organizationId: ctx.organizationId,
          },
          data: {
            ...(person.isDecisionMaker ? { decisionMakerId: person.id } : {}),
            ...(person.isSponsor ? { sponsorId: person.id } : {}),
          },
        });
      }
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "contact_added",
        title:
          `Contacto agregado: ${person.firstName} ${person.lastName}`.trim(),
        summary: person.roleTitle,
      });
      break;
    }

    case "create_task": {
      const dueInDays =
        after.dueInDays == null ? null : Number(after.dueInDays);
      const task = await tx.activity.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: ctx.companyId,
          opportunityId: ctx.defaultOpportunityId,
          type: "task",
          title: String(after.title ?? "Tarea"),
          description: after.description ? String(after.description) : null,
          dueDate:
            dueInDays == null
              ? null
              : new Date(Date.now() + dueInDays * 86_400_000),
          status: "pending",
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "task_created",
        title: `Tarea creada: ${task.title}`,
        summary: task.dueDate
          ? `Vence ${task.dueDate.toLocaleDateString("es-AR")}`
          : null,
      });
      break;
    }

    case "add_note": {
      const note = await tx.note.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: ctx.companyId,
          opportunityId: ctx.defaultOpportunityId,
          title: after.title ? String(after.title) : null,
          body: String(after.body ?? ""),
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "note_added",
        title: note.title ? `Nota: ${note.title}` : "Nota agregada",
        summary:
          note.body.length > 200 ? `${note.body.slice(0, 200)}…` : note.body,
      });
      break;
    }

    default:
      throw new Error(`Tipo de cambio desconocido: ${item.type}`);
  }
}

function stageChangeOf(
  item: ItemRecord,
): { opportunityId: string; from: unknown; to: unknown } | null {
  if (!item.entityId) return null;
  const after = asRecord(item.afterValue);
  const before = asRecord(item.beforeValue);
  if (item.type === "stage_change") {
    return {
      opportunityId: item.entityId,
      from: before.value,
      to: after.value,
    };
  }
  if (
    item.type === "update_field" &&
    item.entity === "opportunity" &&
    String(after.field) === "stage"
  ) {
    return {
      opportunityId: item.entityId,
      from: before.value,
      to: after.value,
    };
  }
  return null;
}

// Resolves the company/opportunity a proposal belongs to, falling back to the
// originating meeting for legacy rows created before the columns existed.
export async function getProposalContext(db: TenantClient, proposalId: string) {
  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    include: {
      meeting: {
        select: { companyId: true, opportunityId: true, title: true },
      },
    },
  });
  if (!proposal) throw new Error("Propuesta no encontrada");

  const companyId = proposal.companyId ?? proposal.meeting?.companyId;
  if (!companyId) throw new Error("Propuesta sin empresa asociada");

  return {
    companyId,
    opportunityId:
      proposal.opportunityId ?? proposal.meeting?.opportunityId ?? null,
    originLabel: proposal.meeting?.title ?? "Chat del agente",
    source: proposal.source,
    meetingId: proposal.meetingId,
  };
}

// Applies every approved item of a proposal. Each item is applied in its own
// transaction so one failure doesn't roll back the rest (item → status=failed).
export async function applyProposal(
  db: TenantClient,
  organizationId: string,
  proposalId: string,
  actorId: string,
): Promise<{ applied: number; failed: number }> {
  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    include: { items: true },
  });
  if (!proposal) throw new Error("Propuesta no encontrada");

  const context = await getProposalContext(db, proposalId);
  const ctx: ApplyContext = {
    db,
    organizationId,
    stages: stagesByKey(await getOrgStages(db)),
    companyId: context.companyId,
    defaultOpportunityId: context.opportunityId,
    originLabel: context.originLabel,
    proposalId,
    actorId,
  };

  let applied = 0;
  let failed = 0;
  const stageChanges: { opportunityId: string; from: unknown; to: unknown }[] =
    [];

  for (const item of proposal.items) {
    if (!item.approved || item.status === "applied") continue;
    try {
      await withOrgTransaction(organizationId, async (tx) => {
        await applyItem(tx, item, ctx);
        await tx.cRMChangeItem.update({
          where: { id: item.id, organizationId },
          data: { status: "applied", appliedAt: new Date() },
        });
      });
      applied += 1;
      const stageChange = stageChangeOf(item);
      if (stageChange) stageChanges.push(stageChange);
    } catch (error) {
      failed += 1;
      await db.cRMChangeItem.update({
        where: { id: item.id },
        data: { status: "failed" },
      });
      console.error(`[apply] item ${item.id} falló`, error);
    }
  }

  // Recompute proposal status and record the timeline event.
  const hasRejected = proposal.items.some((i) => !i.approved);
  const nextStatus =
    failed > 0 || hasRejected ? "partially_approved" : "applied";

  await db.cRMChangeProposal.update({
    where: { id: proposalId },
    data: { status: nextStatus, reviewedBy: actorId, reviewedAt: new Date() },
  });

  await appendTimelineEvent(db, {
    organizationId,
    companyId: ctx.companyId,
    opportunityId: ctx.defaultOpportunityId,
    type: "proposal_applied",
    title: `Cambios aplicados desde "${ctx.originLabel}"`,
    summary: `${applied} cambio(s) aplicado(s)${failed ? `, ${failed} fallido(s)` : ""}.`,
    refType: "proposal",
    refId: proposalId,
    actorId,
  });

  // Fire existing workflow engine for each applied stage change.
  for (const change of stageChanges) {
    await evaluateWorkflows(db, organizationId, {
      entityType: "opportunity",
      entityId: change.opportunityId,
      eventName: "stage_changed",
      before: { stage: change.from },
      after: { stage: change.to },
    });
  }

  return { applied, failed };
}
