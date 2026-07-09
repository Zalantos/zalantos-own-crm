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
  // Null solo para propuestas de enriquecimiento ancladas a una persona sin
  // empresa vinculada; los eventos de timeline company-scoped se omiten.
  companyId: string | null;
  // Fallback opportunity for items that don't target one explicitly
  // (the meeting's opportunity, or the one the chat proposal was scoped to).
  defaultOpportunityId: string | null;
  // Where the proposal came from, for timeline copy ("Reunión X" | "Chat del agente").
  originLabel: string;
  source: string;
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

// What to undo when reverting an applied item. Field/stage/pain/next_step
// items revert from their stored beforeValue, so they return null.
type RevertData = {
  createdEntityId?: string;
  opportunityId?: string | null;
  prevDecisionMakerId?: string | null;
  prevSponsorId?: string | null;
  // Prior mainPain, captured because update_pain items store no beforeValue.
  prevMainPain?: string | null;
  // For link_contact: the fields this item filled on the existing person, so
  // revert only clears what it actually set.
  filledFields?: string[];
};

// Links a decision-maker/sponsor contact onto the target opportunity, capturing
// the prior ids so the link can be undone. Shared by add_contact and link_contact.
async function linkFlaggedContactToOpportunity(
  tx: Prisma.TransactionClient,
  ctx: ApplyContext,
  person: { id: string; isDecisionMaker: boolean; isSponsor: boolean },
): Promise<Pick<RevertData, "opportunityId" | "prevDecisionMakerId" | "prevSponsorId">> {
  if (!ctx.defaultOpportunityId || (!person.isDecisionMaker && !person.isSponsor)) {
    return {};
  }
  const prev = await tx.opportunity.findUnique({
    where: { id: ctx.defaultOpportunityId, organizationId: ctx.organizationId },
    select: { decisionMakerId: true, sponsorId: true },
  });
  await tx.opportunity.update({
    where: { id: ctx.defaultOpportunityId, organizationId: ctx.organizationId },
    data: {
      ...(person.isDecisionMaker ? { decisionMakerId: person.id } : {}),
      ...(person.isSponsor ? { sponsorId: person.id } : {}),
    },
  });
  return {
    opportunityId: ctx.defaultOpportunityId,
    prevDecisionMakerId: person.isDecisionMaker ? (prev?.decisionMakerId ?? null) : undefined,
    prevSponsorId: person.isSponsor ? (prev?.sponsorId ?? null) : undefined,
  };
}

// Applies one item, throwing on any problem so the caller can mark it failed
// without touching sibling items. Writes a granular timeline event in the same
// transaction as the CRM change it describes. Returns the data needed to undo
// the change later (null when beforeValue alone is enough).
async function applyItem(
  tx: Prisma.TransactionClient,
  item: ItemRecord,
  ctx: ApplyContext,
): Promise<RevertData | null> {
  const after = asRecord(item.afterValue);
  const before = asRecord(item.beforeValue);
  const createdVia = ctx.source === "agent" ? "agent" : "meeting";

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
      return null;
    }

    case "update_pain": {
      if (!item.entityId) throw new Error("Falta oportunidad destino");
      const prev = await tx.opportunity.findUnique({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        select: { mainPain: true },
      });
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
      return { opportunityId: item.entityId, prevMainPain: prev?.mainPain ?? null };
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
      return null;
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
      return null;
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
          createdById: ctx.actorId,
          createdVia,
        },
      });
      const revert = await linkFlaggedContactToOpportunity(tx, ctx, person);
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "contact_added",
        title:
          `Contacto agregado: ${person.firstName} ${person.lastName}`.trim(),
        summary: person.roleTitle,
      });
      return { createdEntityId: person.id, ...revert };
    }

    case "link_contact": {
      if (!item.entityId) throw new Error("Falta contacto destino");
      const person = await tx.person.findFirst({
        where: {
          id: item.entityId,
          companyId: ctx.companyId,
          organizationId: ctx.organizationId,
        },
      });
      if (!person) {
        throw new Error(
          `El contacto ${item.entityId} no existe o no pertenece a la empresa`,
        );
      }
      // Fill only the fields the existing record is missing; never overwrite.
      const fillable = ["email", "phone", "roleTitle", "linkedinUrl", "notes"] as const;
      const data: Record<string, string> = {};
      const filledFields: string[] = [];
      for (const field of fillable) {
        const current = (person as Record<string, unknown>)[field];
        const proposed = after[field];
        if ((current == null || current === "") && proposed) {
          data[field] = String(proposed);
          filledFields.push(field);
        }
      }
      // Flags are set (not cleared) if the proposal marks them.
      const flagData: Record<string, boolean> = {};
      if (after.isDecisionMaker && !person.isDecisionMaker) {
        flagData.isDecisionMaker = true;
        filledFields.push("isDecisionMaker");
      }
      if (after.isSponsor && !person.isSponsor) {
        flagData.isSponsor = true;
        filledFields.push("isSponsor");
      }
      if (filledFields.length) {
        await tx.person.update({
          where: { id: person.id, organizationId: ctx.organizationId },
          data: { ...data, ...flagData },
        });
      }
      const merged = { ...person, ...flagData };
      const revert = await linkFlaggedContactToOpportunity(tx, ctx, merged);
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "contact_linked",
        title:
          `Contacto vinculado: ${person.firstName} ${person.lastName}`.trim(),
        summary: filledFields.length
          ? `Campos completados: ${filledFields.join(", ")}`
          : "Sin cambios (ya estaba completo)",
      });
      return { createdEntityId: undefined, filledFields, ...revert };
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
          createdById: ctx.actorId,
          createdVia,
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
      return { createdEntityId: task.id };
    }

    case "add_note": {
      const note = await tx.note.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: ctx.companyId,
          opportunityId: ctx.defaultOpportunityId,
          title: after.title ? String(after.title) : null,
          body: String(after.body ?? ""),
          createdById: ctx.actorId,
          createdVia,
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "note_added",
        title: note.title ? `Nota: ${note.title}` : "Nota agregada",
        summary:
          note.body.length > 200 ? `${note.body.slice(0, 200)}…` : note.body,
      });
      return { createdEntityId: note.id };
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

  const companyId = proposal.companyId ?? proposal.meeting?.companyId ?? null;
  // Enrichment sobre una persona sin empresa vinculada no tiene company; se
  // permite aplicar igual (los items apuntan a la persona por entityId). El
  // resto de fuentes (meeting/agent) sí exige empresa.
  if (!companyId && !proposal.personId) {
    throw new Error("Propuesta sin empresa asociada");
  }

  return {
    companyId,
    opportunityId:
      proposal.opportunityId ?? proposal.meeting?.opportunityId ?? null,
    originLabel:
      proposal.meeting?.title ??
      (proposal.source === "enrichment"
        ? "Enriquecimiento de contexto"
        : "Chat del agente"),
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
    source: context.source,
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
        const revertData = await applyItem(tx, item, ctx);
        await tx.cRMChangeItem.update({
          where: { id: item.id, organizationId },
          data: {
            status: "applied",
            appliedAt: new Date(),
            revertData: (revertData ?? undefined) as Prisma.InputJsonValue,
          },
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
      actorId,
      before: { stage: change.from },
      after: { stage: change.to },
    });
  }

  return { applied, failed };
}

function asRevertData(value: Prisma.JsonValue): RevertData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RevertData)
    : {};
}

// Undoes a single applied item: restores prior field/stage/pain/next-step
// values from beforeValue, or deletes entities that were created (contacts,
// tasks, notes) and unwinds their opportunity links. Idempotent-guarded on
// status === "applied". Mirrors applyItem in reverse.
export async function revertItem(
  db: TenantClient,
  organizationId: string,
  itemId: string,
  actorId: string,
): Promise<void> {
  const item = await db.cRMChangeItem.findFirst({
    where: { id: itemId, organizationId },
    include: { proposal: { select: { id: true } } },
  });
  if (!item) throw new Error("Cambio no encontrado");
  if (item.status !== "applied") {
    throw new Error("Solo se pueden deshacer cambios aplicados");
  }

  const context = await getProposalContext(db, item.proposal.id);
  const ctx: ApplyContext = {
    db,
    organizationId,
    stages: stagesByKey(await getOrgStages(db)),
    companyId: context.companyId,
    defaultOpportunityId: context.opportunityId,
    originLabel: context.originLabel,
    source: context.source,
    proposalId: item.proposal.id,
    actorId,
  };

  const before = asRecord(item.beforeValue);
  const after = asRecord(item.afterValue);
  const revert = asRevertData(item.revertData);
  const itemRecord: ItemRecord = {
    id: item.id,
    type: item.type,
    entity: item.entity,
    entityId: item.entityId,
    beforeValue: item.beforeValue,
    afterValue: item.afterValue,
    approved: item.approved,
    status: item.status,
  };

  let stageReverted: { opportunityId: string; from: unknown; to: unknown } | null =
    null;

  await withOrgTransaction(organizationId, async (tx) => {
    switch (item.type) {
      case "update_field": {
        const field = String(after.field);
        await applyFieldUpdate(tx, itemRecord, ctx, field, before.value ?? null);
        if (item.entity === "opportunity" && field === "stage" && item.entityId) {
          stageReverted = {
            opportunityId: item.entityId,
            from: after.value,
            to: before.value,
          };
        }
        break;
      }
      case "stage_change": {
        if (item.entityId && before.value != null) {
          const stage = resolveStage(ctx, before.value);
          await tx.opportunity.update({
            where: { id: item.entityId, organizationId },
            data: { stageId: stage.id },
          });
          stageReverted = {
            opportunityId: item.entityId,
            from: after.value,
            to: before.value,
          };
        }
        break;
      }
      case "update_pain": {
        if (item.entityId) {
          await tx.opportunity.update({
            where: { id: item.entityId, organizationId },
            data: { mainPain: revert.prevMainPain ?? null },
          });
        }
        break;
      }
      case "update_next_step": {
        if (item.entityId) {
          await tx.opportunity.update({
            where: { id: item.entityId, organizationId },
            data: {
              nextStep: before.nextStep == null ? null : String(before.nextStep),
              nextStepDueDate: before.nextStepDueDate
                ? new Date(String(before.nextStepDueDate))
                : null,
            },
          });
        }
        break;
      }
      case "add_contact": {
        await restoreOpportunityLinks(tx, organizationId, revert);
        if (revert.createdEntityId) {
          await tx.person.delete({
            where: { id: revert.createdEntityId, organizationId },
          });
        }
        break;
      }
      case "link_contact": {
        await restoreOpportunityLinks(tx, organizationId, revert);
        // Clear only the fields this item filled on the existing person.
        if (item.entityId && revert.filledFields?.length) {
          const data: Record<string, string | null | boolean> = {};
          for (const field of revert.filledFields) {
            if (field === "isDecisionMaker" || field === "isSponsor") {
              data[field] = false;
            } else {
              data[field] = null;
            }
          }
          await tx.person.update({
            where: { id: item.entityId, organizationId },
            data,
          });
        }
        break;
      }
      case "create_task": {
        if (revert.createdEntityId) {
          await tx.activity.delete({
            where: { id: revert.createdEntityId, organizationId },
          });
        }
        break;
      }
      case "add_note": {
        if (revert.createdEntityId) {
          await tx.note.delete({
            where: { id: revert.createdEntityId, organizationId },
          });
        }
        break;
      }
      default:
        throw new Error(`No se puede deshacer el tipo: ${item.type}`);
    }

    await tx.cRMChangeItem.update({
      where: { id: item.id, organizationId },
      data: { status: "reverted", revertedAt: new Date() },
    });
  });

  await appendTimelineEvent(db, {
    organizationId,
    companyId: ctx.companyId,
    opportunityId:
      item.entity === "opportunity" && item.entityId
        ? item.entityId
        : ctx.defaultOpportunityId,
    type: "change_reverted",
    title: "Cambio deshecho",
    summary: `Se revirtió un cambio de "${ctx.originLabel}".`,
    refType: "proposal",
    refId: ctx.proposalId,
    actorId,
    metadata: { itemId: item.id, itemType: item.type },
  });

  if (stageReverted) {
    const change: { opportunityId: string; from: unknown; to: unknown } =
      stageReverted;
    await evaluateWorkflows(db, organizationId, {
      entityType: "opportunity",
      entityId: change.opportunityId,
      eventName: "stage_changed",
      actorId,
      before: { stage: change.from },
      after: { stage: change.to },
    });
  }
}

// Restores an opportunity's decisionMaker/sponsor to the ids captured before an
// add_contact/link_contact set them.
async function restoreOpportunityLinks(
  tx: Prisma.TransactionClient,
  organizationId: string,
  revert: RevertData,
): Promise<void> {
  if (!revert.opportunityId) return;
  const data: Record<string, string | null> = {};
  if (revert.prevDecisionMakerId !== undefined) {
    data.decisionMakerId = revert.prevDecisionMakerId;
  }
  if (revert.prevSponsorId !== undefined) {
    data.sponsorId = revert.prevSponsorId;
  }
  if (Object.keys(data).length === 0) return;
  await tx.opportunity.update({
    where: { id: revert.opportunityId, organizationId },
    data,
  });
}
