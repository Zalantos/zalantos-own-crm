import { Prisma, type Person } from "@prisma/client";
import { withOrgTransaction, type TenantClient } from "@/lib/tenant";
import {
  findExistingPerson,
  normalizeEmail,
  normalizePersonName,
} from "@/lib/crm/person-dedup";
import { appendTimelineEvent } from "@/lib/timeline";
import { evaluateWorkflows } from "@/lib/workflows/engine";
import {
  getOrgStages,
  stagesByKey,
  type StageOption,
} from "@/lib/pipeline/stages";
import {
  coerceFieldValue,
  getWritableFields,
  resolveField,
  type AgentEntity,
} from "@/lib/agent/field-registry";
import { upsertCustomFieldValue } from "@/lib/custom-fields/merge";
import { LOSS_REASONS, isLossReason } from "@/lib/opportunities/loss-reason";
import {
  applyTaskUpdate,
  insertLoggedActivity,
  insertManualMeeting,
  loggedActivityFromJson,
  manualMeetingFromJson,
  revertLoggedActivity,
  revertManualMeeting,
  revertTaskUpdate,
  taskUpdateFromJson,
  type LoggedActivityRevert,
  type ManualMeetingRevert,
  type TaskUpdateRevert,
  type WriteBase,
} from "@/lib/crm/activity-records";

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

const UNDO_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

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

// El responsable propuesto debe ser un usuario activo de la org.
async function assertActiveOrgUser(
  tx: Prisma.TransactionClient,
  ctx: ApplyContext,
  userId: string,
): Promise<void> {
  const user = await tx.user.findFirst({
    where: { id: userId, organizationId: ctx.organizationId, isActive: true },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `El usuario ${userId} no existe o no está activo en la organización`,
    );
  }
}

// Person refs proposed by the model must exist and belong to the company.
async function assertPersonInCompany(
  tx: Prisma.TransactionClient,
  ctx: ApplyContext,
  personId: string,
): Promise<void> {
  if (!ctx.companyId) throw new Error("Falta empresa destino");
  const person = await tx.person.findFirst({
    where: {
      id: personId,
      organizationId: ctx.organizationId,
      OR: [
        { companyId: ctx.companyId },
        {
          companyRelationships: {
            some: { companyId: ctx.companyId, endedAt: null },
          },
        },
      ],
    },
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
  const coercedValue = coerceFieldValue(spec, field, value);
  const coerced =
    entity === "person" && field === "email"
      ? normalizeEmail(coercedValue == null ? null : String(coercedValue))
      : entity === "person" && (field === "firstName" || field === "lastName")
        ? normalizePersonName(
            coercedValue == null ? null : String(coercedValue),
          )
        : coercedValue;

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

  if (spec.type === "userRef" && coerced != null) {
    await assertActiveOrgUser(tx, ctx, String(coerced));
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
  createdRelationshipId?: string;
  personId?: string;
  opportunityId?: string | null;
  prevDecisionMakerId?: string | null;
  prevSponsorId?: string | null;
  // Prior mainPain, captured because update_pain items store no beforeValue.
  prevMainPain?: string | null;
  // For link_contact: the fields this item filled on the existing person, so
  // revert only clears what it actually set.
  filledFields?: string[];
  // log_activity / create_meeting / update_task (ver crm/activity-records).
  loggedActivity?: LoggedActivityRevert;
  manualMeeting?: ManualMeetingRevert;
  taskUpdate?: TaskUpdateRevert;
  // Cambio de estado aplicado por update_task, para disparar workflows
  // después de commitear.
  taskStatusChange?: { from: string; to: string };
  activityUpdate?: {
    activityId: string;
    companyId: string;
    previousCompanyLastContactAt: string | null;
  };
};

type NormalizedContact = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  isDecisionMaker: boolean;
  isSponsor: boolean;
};

async function ensurePersonCompanyRelationship(
  tx: Prisma.TransactionClient,
  ctx: ApplyContext,
  person: { id: string; companyId: string | null; roleTitle: string | null },
) {
  if (!ctx.companyId) throw new Error("Falta empresa destino");
  const existing = await tx.personCompanyRelationship.findUnique({
    where: {
      personId_companyId: { personId: person.id, companyId: ctx.companyId },
    },
    select: { id: true },
  });
  if (existing) return null;
  const relationship = await tx.personCompanyRelationship.create({
    data: {
      organizationId: ctx.organizationId,
      personId: person.id,
      companyId: ctx.companyId,
      roles: ["contact"],
      roleTitle: person.companyId ? null : person.roleTitle,
      isPrimary: !person.companyId,
    },
    select: { id: true },
  });
  if (!person.companyId) {
    await tx.person.update({
      where: { id: person.id, organizationId: ctx.organizationId },
      data: { companyId: ctx.companyId },
    });
  }
  return relationship.id;
}

function optionalString(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed))
    throw new Error(`Número inválido: ${String(value)}`);
  return parsed;
}

function optionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Fecha inválida: ${String(value)}`);
  }
  return parsed;
}

function normalizeContact(after: Record<string, unknown>): NormalizedContact {
  return {
    firstName: normalizePersonName(
      after.firstName == null ? null : String(after.firstName),
    ),
    lastName: normalizePersonName(
      after.lastName == null ? null : String(after.lastName),
    ),
    email: normalizeEmail(after.email == null ? null : String(after.email)),
    phone: optionalString(after.phone),
    roleTitle: optionalString(after.roleTitle),
    linkedinUrl: optionalString(after.linkedinUrl),
    notes: optionalString(after.notes),
    isDecisionMaker: Boolean(after.isDecisionMaker),
    isSponsor: Boolean(after.isSponsor),
  };
}

async function fillEmptyPersonFields(
  tx: Prisma.TransactionClient,
  organizationId: string,
  person: Person,
  proposed: NormalizedContact,
): Promise<{ person: Person; filledFields: string[] }> {
  const fillable = [
    "email",
    "phone",
    "roleTitle",
    "linkedinUrl",
    "notes",
  ] as const;
  const data: Record<string, string | boolean> = {};
  const filledFields: string[] = [];

  for (const field of fillable) {
    const current = person[field];
    const value = proposed[field];
    if ((current == null || current === "") && value) {
      data[field] = value;
      filledFields.push(field);
    }
  }
  if (proposed.isDecisionMaker && !person.isDecisionMaker) {
    data.isDecisionMaker = true;
    filledFields.push("isDecisionMaker");
  }
  if (proposed.isSponsor && !person.isSponsor) {
    data.isSponsor = true;
    filledFields.push("isSponsor");
  }

  if (!filledFields.length) return { person, filledFields };
  const updated = await tx.person.update({
    where: { id: person.id, organizationId },
    data,
  });
  return { person: updated, filledFields };
}

async function clearFilledPersonFields(
  tx: Prisma.TransactionClient,
  organizationId: string,
  personId: string,
  filledFields: string[],
): Promise<void> {
  const data: Record<string, string | null | boolean> = {};
  for (const field of filledFields) {
    if (field === "isDecisionMaker" || field === "isSponsor") {
      data[field] = false;
    } else {
      data[field] = null;
    }
  }
  await tx.person.update({
    where: { id: personId, organizationId },
    data,
  });
}

// Links a decision-maker/sponsor contact onto the target opportunity, capturing
// the prior ids so the link can be undone. Shared by add_contact and link_contact.
async function linkFlaggedContactToOpportunity(
  tx: Prisma.TransactionClient,
  ctx: ApplyContext,
  person: { id: string; isDecisionMaker: boolean; isSponsor: boolean },
): Promise<
  Pick<RevertData, "opportunityId" | "prevDecisionMakerId" | "prevSponsorId">
> {
  if (
    !ctx.defaultOpportunityId ||
    (!person.isDecisionMaker && !person.isSponsor)
  ) {
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
    prevDecisionMakerId: person.isDecisionMaker
      ? (prev?.decisionMakerId ?? null)
      : undefined,
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
  const createdVia =
    ctx.source === "agent"
      ? "agent"
      : ctx.source === "enrichment"
        ? "enrichment"
        : "meeting";

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
      return {
        opportunityId: item.entityId,
        prevMainPain: prev?.mainPain ?? null,
      };
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
      if (!ctx.companyId) throw new Error("Falta empresa destino");
      const contact = normalizeContact(after);
      const match = await findExistingPerson(tx, ctx.organizationId, {
        companyId: ctx.companyId,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
      });

      if (match) {
        const existing = await tx.person.findFirst({
          where: {
            id: match.id,
            organizationId: ctx.organizationId,
          },
        });
        if (!existing)
          throw new Error("El contacto existente ya no está disponible");

        const createdRelationshipId = await ensurePersonCompanyRelationship(
          tx,
          ctx,
          existing,
        );

        const filled = await fillEmptyPersonFields(
          tx,
          ctx.organizationId,
          existing,
          contact,
        );
        const revert = await linkFlaggedContactToOpportunity(
          tx,
          ctx,
          filled.person,
        );
        await appendTimelineEvent(tx, {
          ...timelineBase,
          type: "contact_linked",
          title:
            `Contacto vinculado: ${existing.firstName} ${existing.lastName}`.trim(),
          summary: filled.filledFields.length
            ? `Campos completados: ${filled.filledFields.join(", ")}`
            : "Sin cambios (ya estaba completo)",
        });
        return {
          personId: existing.id,
          ...(createdRelationshipId ? { createdRelationshipId } : {}),
          filledFields: filled.filledFields,
          ...revert,
        };
      }

      const person = await tx.person.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: ctx.companyId,
          ...contact,
          firstName: contact.firstName || "Sin nombre",
          createdById: ctx.actorId,
          createdVia,
        },
      });
      await tx.personCompanyRelationship.create({
        data: {
          organizationId: ctx.organizationId,
          personId: person.id,
          companyId: ctx.companyId,
          roles: ["contact"],
          roleTitle: person.roleTitle,
          isPrimary: true,
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

    case "add_company": {
      const company = await tx.company.create({
        data: {
          organizationId: ctx.organizationId,
          name: String(after.name ?? "").trim() || "Sin nombre",
          website: after.website ? String(after.website) : null,
          industry: after.industry ? String(after.industry) : null,
          size: after.size ? String(after.size) : null,
          country: after.country ? String(after.country) : null,
          city: after.city ? String(after.city) : null,
          linkedinUrl: after.linkedinUrl ? String(after.linkedinUrl) : null,
          description: after.description ? String(after.description) : null,
          icpScore: optionalNumber(after.icpScore),
          fitScore: optionalNumber(after.fitScore),
          painScore: optionalNumber(after.painScore),
          status: optionalString(after.status) ?? "active",
          source: optionalString(after.source),
          priority: optionalString(after.priority),
          mainPain: optionalString(after.mainPain),
          productInterest: optionalString(after.productInterest),
          potentialValue:
            after.potentialValue == null ? null : String(after.potentialValue),
          buyingTiming: optionalString(after.buyingTiming),
          urgency: optionalString(after.urgency),
          competitor: optionalString(after.competitor),
          currentProvider: optionalString(after.currentProvider),
          nextStep: optionalString(after.nextStep),
          nextStepDueDate: optionalDate(after.nextStepDueDate),
          lastContactAt: optionalDate(after.lastContactAt),
          createdById: ctx.actorId,
          createdVia,
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        companyId: company.id,
        type: "company_created",
        title: `Empresa creada: ${company.name}`,
      });
      return { createdEntityId: company.id };
    }

    case "add_opportunity": {
      if (!ctx.companyId) throw new Error("Falta empresa destino");
      const stage = resolveStage(ctx, after.stage);
      const decisionMakerId = optionalString(after.decisionMakerId);
      const sponsorId = optionalString(after.sponsorId);
      if (decisionMakerId)
        await assertPersonInCompany(tx, ctx, decisionMakerId);
      if (sponsorId) await assertPersonInCompany(tx, ctx, sponsorId);
      const ownerId = optionalString(after.ownerId);
      if (ownerId) await assertActiveOrgUser(tx, ctx, ownerId);
      const lossReason = optionalString(after.lossReason);
      if (lossReason && !isLossReason(lossReason)) {
        throw new Error(
          `Motivo de pérdida inválido "${lossReason}". Valores permitidos: ${LOSS_REASONS.join(", ")}`,
        );
      }
      const opportunity = await tx.opportunity.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: ctx.companyId,
          name: String(after.name ?? "").trim() || "Sin nombre",
          stageId: stage.id,
          estimatedValue:
            after.estimatedValue == null ? null : String(after.estimatedValue),
          probability: optionalNumber(after.probability),
          source: optionalString(after.source),
          mainPain: optionalString(after.mainPain),
          urgency: optionalString(after.urgency),
          decisionMakerId,
          sponsorId,
          nextStep: optionalString(after.nextStep),
          nextStepDueDate: optionalDate(after.nextStepDueDate),
          expectedCloseDate: optionalDate(after.expectedCloseDate),
          status: optionalString(after.status) ?? "open",
          lossReason:
            lossReason && isLossReason(lossReason) ? lossReason : null,
          ownerId: ownerId ?? ctx.actorId,
          createdById: ctx.actorId,
          createdVia,
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        opportunityId: opportunity.id,
        type: "opportunity_created",
        title: `Oportunidad creada: ${opportunity.name}`,
        summary: stage.label,
      });
      return { createdEntityId: opportunity.id };
    }

    case "link_contact": {
      if (!item.entityId) throw new Error("Falta contacto destino");
      if (!ctx.companyId) throw new Error("Falta empresa destino");
      const contact = normalizeContact(after);
      const person = await tx.person.findFirst({
        where: {
          id: item.entityId,
          organizationId: ctx.organizationId,
        },
      });
      if (!person) {
        throw new Error(`El contacto ${item.entityId} no existe`);
      }
      const createdRelationshipId = await ensurePersonCompanyRelationship(
        tx,
        ctx,
        person,
      );
      const filled = await fillEmptyPersonFields(
        tx,
        ctx.organizationId,
        person,
        contact,
      );
      const revert = await linkFlaggedContactToOpportunity(
        tx,
        ctx,
        filled.person,
      );
      await appendTimelineEvent(tx, {
        ...timelineBase,
        type: "contact_linked",
        title:
          `Contacto vinculado: ${person.firstName} ${person.lastName}`.trim(),
        summary: filled.filledFields.length
          ? `Campos completados: ${filled.filledFields.join(", ")}`
          : "Sin cambios (ya estaba completo)",
      });
      return {
        filledFields: filled.filledFields,
        ...(createdRelationshipId ? { createdRelationshipId } : {}),
        ...revert,
      };
    }

    case "create_task": {
      // El chat propone dueDate absoluto (ISO); la pipeline de reuniones
      // propone dueInDays relativo a cuándo se aplica. Se prioriza el
      // absoluto cuando ambos podrían estar presentes.
      const dueInDays =
        after.dueInDays == null ? null : Number(after.dueInDays);
      const dueDate =
        after.dueDate != null ? new Date(String(after.dueDate)) : null;
      const plannedDate = optionalDate(after.plannedDate);
      const status = optionalString(after.status) ?? "todo";
      const assigneeId = optionalString(after.assigneeId);
      const completedById = optionalString(after.completedById);
      const blockedReason = optionalString(after.blockedReason);
      if (blockedReason && status !== "blocked") {
        throw new Error(
          "blockedReason solo se puede guardar con status blocked",
        );
      }
      const task = await tx.activity.create({
        data: {
          organizationId: ctx.organizationId,
          companyId: ctx.companyId,
          opportunityId: ctx.defaultOpportunityId,
          personId: after.personId ? String(after.personId) : null,
          assigneeId,
          completedById:
            completedById ?? (status === "done" ? assigneeId : null),
          priority: after.priority ? String(after.priority) : null,
          type: optionalString(after.activityType) ?? "task",
          title: String(after.title ?? "Tarea"),
          description: after.description ? String(after.description) : null,
          plannedDate,
          dueDate:
            dueDate && !Number.isNaN(dueDate.getTime())
              ? dueDate
              : dueInDays == null
                ? null
                : new Date(Date.now() + dueInDays * 86_400_000),
          status,
          statusChangedAt: after.status != null ? new Date() : null,
          completedAt: status === "done" ? new Date() : null,
          blockedReason: status === "blocked" ? blockedReason : null,
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
          personId: after.personId ? String(after.personId) : null,
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

    // Los ítems del agente guardan companyId/opportunityId propios en
    // afterValue; la propuesta solo aporta el fallback.
    case "log_activity": {
      const revert = await insertLoggedActivity(
        tx,
        recordsBase(ctx, createdVia),
        loggedActivityFromJson(after, ctx.companyId),
      );
      return { createdEntityId: revert.activityId, loggedActivity: revert };
    }

    case "create_meeting": {
      const revert = await insertManualMeeting(
        tx,
        recordsBase(ctx, createdVia),
        manualMeetingFromJson(after, ctx.companyId),
      );
      return { createdEntityId: revert.meetingId, manualMeeting: revert };
    }

    case "update_task": {
      const { taskId, input } = taskUpdateFromJson(after);
      const result = await applyTaskUpdate(
        tx,
        recordsBase(ctx, createdVia),
        taskId,
        input,
      );
      return {
        taskUpdate: {
          taskId: result.taskId,
          before: result.before,
          timelineEventIds: result.timelineEventIds,
        },
        ...(result.statusChange
          ? { taskStatusChange: result.statusChange }
          : {}),
      };
    }

    case "update_note": {
      if (!item.entityId) throw new Error("Falta nota destino");
      const note = await tx.note.update({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        data: {
          ...(Object.hasOwn(after, "title")
            ? { title: optionalString(after.title) }
            : {}),
          ...(Object.hasOwn(after, "body")
            ? { body: String(after.body ?? "") }
            : {}),
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        companyId: note.companyId,
        opportunityId: note.opportunityId,
        type: "note_updated",
        title: `Nota actualizada: ${note.title ?? "Sin título"}`,
      });
      return null;
    }

    case "update_activity": {
      if (!item.entityId) throw new Error("Falta actividad destino");
      const companyId = String(after.companyId ?? "");
      if (!companyId) throw new Error("La actividad debe tener una empresa");
      const occurredAt = optionalDate(after.occurredAt);
      if (!occurredAt) throw new Error("La actividad debe tener fecha");
      const previousCompany = await tx.company.findUnique({
        where: { id: companyId, organizationId: ctx.organizationId },
        select: { lastContactAt: true },
      });
      const personIds = Array.isArray(after.personIds)
        ? after.personIds.map(String)
        : [];
      const activity = await tx.activity.update({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        data: {
          companyId,
          opportunityId: optionalString(after.opportunityId),
          personId: personIds[0] ?? null,
          type: String(after.type ?? "other"),
          title: String(after.title ?? "Actividad"),
          occurredAt,
          completedAt: occurredAt,
          durationMinutes:
            after.durationMinutes == null
              ? null
              : Number(after.durationMinutes),
          channel: optionalString(after.channel),
          description: optionalString(after.description),
          outcomes: optionalString(after.outcomes),
          participants: {
            deleteMany: {},
            create: personIds.map((personId) => ({
              organizationId: ctx.organizationId,
              personId,
            })),
          },
        },
      });
      if (occurredAt.getTime() <= Date.now()) {
        await tx.company.updateMany({
          where: {
            id: companyId,
            organizationId: ctx.organizationId,
            OR: [
              { lastContactAt: null },
              { lastContactAt: { lt: occurredAt } },
            ],
          },
          data: { lastContactAt: occurredAt },
        });
      }
      await appendTimelineEvent(tx, {
        ...timelineBase,
        companyId,
        opportunityId: activity.opportunityId,
        type: "activity_updated",
        title: `Actividad actualizada: ${activity.title}`,
      });
      return {
        activityUpdate: {
          activityId: activity.id,
          companyId,
          previousCompanyLastContactAt:
            previousCompany?.lastContactAt?.toISOString() ?? null,
        },
      };
    }

    case "update_meeting": {
      if (!item.entityId) throw new Error("Falta reunión destino");
      const meeting = await tx.meeting.update({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        data: {
          companyId: String(after.companyId),
          opportunityId: optionalString(after.opportunityId),
          title: String(after.title),
          meetingDate: new Date(String(after.meetingDate)),
          meetingType: String(after.meetingType),
          participants: (after.participants ?? []) as Prisma.InputJsonValue,
          status: String(after.status),
          ...(Object.hasOwn(after, "aiSummary")
            ? {
                aiSummary:
                  after.aiSummary == null
                    ? Prisma.JsonNull
                    : (after.aiSummary as Prisma.InputJsonValue),
              }
            : {}),
        },
      });
      await appendTimelineEvent(tx, {
        ...timelineBase,
        companyId: meeting.companyId,
        opportunityId: meeting.opportunityId,
        type: "meeting_updated",
        title: `Reunión actualizada: ${meeting.title}`,
      });
      return null;
    }

    default:
      throw new Error(`Tipo de cambio desconocido: ${item.type}`);
  }
}

function recordsBase(ctx: ApplyContext, createdVia: string): WriteBase {
  return {
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    createdVia,
    metadata: { proposalId: ctx.proposalId, originLabel: ctx.originLabel },
  };
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
  // permite aplicar igual (los items apuntan a la persona por entityId). Una
  // propuesta de agente para dar de alta una empresa nueva tampoco tiene
  // company todavía (es lo que el ítem add_company va a crear). El resto de
  // fuentes (meeting) sí exige empresa.
  if (!companyId && !proposal.personId && proposal.source !== "agent") {
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

const APPLY_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

function appliedResult(items: { status: string }[]) {
  return {
    applied: items.filter((item) => item.status === "applied").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function appliedFieldValue(
  tx: Prisma.TransactionClient,
  item: ItemRecord,
  ctx: ApplyContext,
  field: string,
): Promise<unknown> {
  const entity = asAgentEntity(item.entity);
  const entityId =
    item.entityId ?? (entity === "company" ? ctx.companyId : null);
  if (!entityId) return null;
  const fields = await getWritableFields(ctx.db, entity);
  const spec = resolveField(fields, entity, field);
  if (spec.customDefinition) {
    const value = await tx.customFieldValue.findFirst({
      where: {
        organizationId: ctx.organizationId,
        entityType: entity,
        entityId,
        fieldDefinitionId: spec.customDefinition.id,
      },
    });
    if (!value) return null;
    switch (spec.customDefinition.fieldType) {
      case "text":
      case "select":
        return value.valueText;
      case "number":
        return value.valueNumber;
      case "boolean":
        return value.valueBoolean;
      case "date":
        return value.valueDate;
      case "multiselect":
        return value.valueJson;
    }
  }
  if (entity === "opportunity" && field === "stage") {
    const row = await tx.opportunity.findUnique({
      where: { id: entityId, organizationId: ctx.organizationId },
      select: { stage: { select: { key: true } } },
    });
    return row?.stage.key ?? null;
  }
  const row =
    entity === "company"
      ? await tx.company.findUnique({
          where: { id: entityId, organizationId: ctx.organizationId },
        })
      : entity === "opportunity"
        ? await tx.opportunity.findUnique({
            where: { id: entityId, organizationId: ctx.organizationId },
          })
        : await tx.person.findUnique({
            where: { id: entityId, organizationId: ctx.organizationId },
          });
  return row ? (row as unknown as Record<string, unknown>)[field] : null;
}

async function appliedSnapshotOf(
  tx: Prisma.TransactionClient,
  item: ItemRecord,
  ctx: ApplyContext,
  revertData: RevertData | null,
): Promise<Prisma.InputJsonValue> {
  const after = asRecord(item.afterValue);
  if (item.type === "update_field") {
    const field = String(after.field);
    return jsonSnapshot({
      field,
      value: await appliedFieldValue(tx, item, ctx, field),
    });
  }
  if (item.type === "stage_change") {
    const row = await tx.opportunity.findUnique({
      where: { id: item.entityId ?? "", organizationId: ctx.organizationId },
      select: { stage: { select: { key: true } } },
    });
    return jsonSnapshot({ value: row?.stage.key ?? null });
  }
  if (item.type === "update_pain") {
    const row = await tx.opportunity.findUnique({
      where: { id: item.entityId ?? "", organizationId: ctx.organizationId },
      select: { mainPain: true },
    });
    return jsonSnapshot({ value: row?.mainPain ?? null });
  }
  if (item.type === "update_next_step") {
    const row = await tx.opportunity.findUnique({
      where: { id: item.entityId ?? "", organizationId: ctx.organizationId },
      select: { nextStep: true, nextStepDueDate: true },
    });
    return jsonSnapshot(row);
  }
  if (item.type === "update_note") {
    const row = await tx.note.findUnique({
      where: { id: item.entityId ?? "", organizationId: ctx.organizationId },
      select: { title: true, body: true },
    });
    return jsonSnapshot(
      Object.fromEntries(
        Object.keys(after).map((field) => [
          field,
          (row as Record<string, unknown> | null)?.[field] ?? null,
        ]),
      ),
    );
  }
  if (item.type === "update_task") {
    const row = await tx.activity.findUnique({
      where: { id: item.entityId ?? "", organizationId: ctx.organizationId },
    });
    return jsonSnapshot(
      Object.fromEntries(
        Object.keys(after)
          .filter((field) => field !== "taskId")
          .map((field) => [
            field,
            (row as unknown as Record<string, unknown> | null)?.[field] ?? null,
          ]),
      ),
    );
  }
  if (item.type === "update_activity") {
    const row = await tx.activity.findUnique({
      where: { id: item.entityId ?? "", organizationId: ctx.organizationId },
      include: { participants: { select: { personId: true } } },
    });
    return jsonSnapshot(
      row
        ? {
            companyId: row.companyId,
            opportunityId: row.opportunityId,
            personIds: row.participants.map(({ personId }) => personId),
            type: row.type,
            title: row.title,
            occurredAt: row.occurredAt,
            durationMinutes: row.durationMinutes,
            channel: row.channel,
            description: row.description,
            outcomes: row.outcomes,
          }
        : null,
    );
  }
  if (item.type === "update_meeting") {
    const row = await tx.meeting.findUnique({
      where: { id: item.entityId ?? "", organizationId: ctx.organizationId },
    });
    return jsonSnapshot(
      row
        ? {
            companyId: row.companyId,
            opportunityId: row.opportunityId,
            title: row.title,
            meetingDate: row.meetingDate,
            meetingType: row.meetingType,
            participants: row.participants,
            status: row.status,
            aiSummary: row.aiSummary,
          }
        : null,
    );
  }
  if (
    (item.type === "link_contact" || item.type === "add_contact") &&
    !revertData?.createdEntityId &&
    (item.entityId || revertData?.personId)
  ) {
    const row = await tx.person.findUnique({
      where: {
        id: item.entityId ?? revertData?.personId ?? "",
        organizationId: ctx.organizationId,
      },
    });
    return jsonSnapshot(
      row
        ? {
            ...after,
            ...Object.fromEntries(
              (revertData?.filledFields ?? []).map((field) => [
                field,
                (row as unknown as Record<string, unknown>)[field] ?? null,
              ]),
            ),
          }
        : after,
    );
  }

  const createdEntityId = revertData?.createdEntityId;
  let createdRecord: unknown = null;
  if (createdEntityId) {
    if (item.type === "add_company") {
      createdRecord = await tx.company.findUnique({
        where: { id: createdEntityId, organizationId: ctx.organizationId },
      });
    } else if (item.type === "add_opportunity") {
      createdRecord = await tx.opportunity.findUnique({
        where: { id: createdEntityId, organizationId: ctx.organizationId },
      });
    } else if (item.type === "add_contact") {
      createdRecord = await tx.person.findUnique({
        where: { id: createdEntityId, organizationId: ctx.organizationId },
      });
    } else if (item.type === "create_task" || item.type === "log_activity") {
      createdRecord = await tx.activity.findUnique({
        where: { id: createdEntityId, organizationId: ctx.organizationId },
      });
    } else if (item.type === "add_note") {
      createdRecord = await tx.note.findUnique({
        where: { id: createdEntityId, organizationId: ctx.organizationId },
      });
    } else if (item.type === "create_meeting") {
      createdRecord = await tx.meeting.findUnique({
        where: { id: createdEntityId, organizationId: ctx.organizationId },
      });
    }
  }
  return jsonSnapshot({
    ...after,
    ...(createdEntityId ? { createdEntityId, record: createdRecord } : {}),
  });
}

export async function claimProposalForApply(
  db: TenantClient,
  proposalId: string,
): Promise<{ applied: number; failed: number } | null> {
  const now = new Date();
  const claimed = await db.cRMChangeProposal.updateMany({
    where: { id: proposalId, status: { in: ["pending", "partially_applied"] } },
    data: { status: "applying", applyStartedAt: now },
  });
  if (claimed.count === 1) return null;

  let current = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    select: {
      status: true,
      applyStartedAt: true,
      items: { select: { status: true } },
    },
  });
  if (!current) throw new Error("Propuesta no encontrada");

  const staleBefore = new Date(now.getTime() - APPLY_LOCK_TIMEOUT_MS);
  if (
    current.status === "applying" &&
    current.applyStartedAt &&
    current.applyStartedAt < staleBefore
  ) {
    const reclaimed = await db.cRMChangeProposal.updateMany({
      where: {
        id: proposalId,
        status: "applying",
        applyStartedAt: { lt: staleBefore },
      },
      data: { applyStartedAt: now },
    });
    if (reclaimed.count === 1) return null;
    current = await db.cRMChangeProposal.findUnique({
      where: { id: proposalId },
      select: {
        status: true,
        applyStartedAt: true,
        items: { select: { status: true } },
      },
    });
    if (!current) throw new Error("Propuesta no encontrada");
  }

  if (current.status === "applying") {
    throw new Error("La propuesta ya se está aplicando");
  }
  if (
    current.status === "applied" ||
    current.status === "partially_applied" ||
    current.status === "failed" ||
    current.status === "partially_approved" ||
    current.status === "rejected" ||
    current.status === "partially_reverted" ||
    current.status === "reverted"
  ) {
    return appliedResult(current.items);
  }
  throw new Error(
    `La propuesta no se puede aplicar desde el estado ${current.status}`,
  );
}

// Applies every approved item of a proposal. Each item is applied in its own
// transaction so one failure doesn't roll back the rest (item → status=failed).
export async function applyProposal(
  db: TenantClient,
  organizationId: string,
  proposalId: string,
  actorId: string,
): Promise<{ applied: number; failed: number }> {
  const previousResult = await claimProposalForApply(db, proposalId);
  if (previousResult) return previousResult;

  const proposal = await db.cRMChangeProposal.findUnique({
    where: { id: proposalId },
    include: { items: true },
  });
  if (!proposal) throw new Error("Propuesta no encontrada");
  if (proposal.status !== "applying") {
    throw new Error("La propuesta perdió el candado de aplicación");
  }

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
  const stageChanges: {
    itemId: string;
    opportunityId: string;
    from: unknown;
    to: unknown;
  }[] = [];
  const taskStatusChanges: {
    itemId: string;
    taskId: string;
    from: string;
    to: string;
  }[] = [];

  for (const item of proposal.items) {
    if (!item.approved || !["pending", "approved"].includes(item.status)) {
      continue;
    }
    try {
      const revertData = await withOrgTransaction(
        organizationId,
        async (tx) => {
          const revertData = await applyItem(tx, item, ctx);
          const appliedAt = new Date();
          await tx.cRMChangeItem.update({
            where: { id: item.id, organizationId },
            data: {
              status: "applied",
              appliedAt,
              appliedSnapshot: await appliedSnapshotOf(
                tx,
                item,
                ctx,
                revertData,
              ),
              undoExpiresAt: new Date(appliedAt.getTime() + UNDO_WINDOW_MS),
              revertData: (revertData ?? undefined) as Prisma.InputJsonValue,
              failureCode: null,
              failureMessage: null,
            },
          });
          return revertData;
        },
      );
      applied += 1;
      const stageChange = stageChangeOf(item);
      if (stageChange) stageChanges.push({ itemId: item.id, ...stageChange });
      if (revertData?.taskUpdate && revertData.taskStatusChange) {
        taskStatusChanges.push({
          itemId: item.id,
          taskId: revertData.taskUpdate.taskId,
          ...revertData.taskStatusChange,
        });
      }
    } catch (error) {
      failed += 1;
      await db.cRMChangeItem.update({
        where: { id: item.id },
        data: {
          status: "failed",
          failureCode: "apply_failed",
          failureMessage:
            error instanceof Error ? error.message : "Error inesperado",
        },
      });
      console.error(`[apply] item ${item.id} falló`, error);
    }
  }

  const itemStates = await db.cRMChangeItem.findMany({
    where: { proposalId },
    select: { status: true },
  });
  const totalApplied = itemStates.filter(
    (item) => item.status === "applied",
  ).length;
  const totalFailed = itemStates.filter(
    (item) => item.status === "failed",
  ).length;
  const totalPending = itemStates.filter(
    (item) => item.status === "pending" || item.status === "approved",
  ).length;
  const totalRejected = itemStates.filter(
    (item) => item.status === "rejected",
  ).length;
  const nextStatus =
    totalPending > 0
      ? totalApplied > 0 || totalFailed > 0
        ? "partially_applied"
        : "pending"
      : totalFailed > 0
        ? totalApplied > 0
          ? "partially_applied"
          : "failed"
        : totalRejected > 0
          ? totalApplied > 0
            ? "partially_approved"
            : "rejected"
          : "applied";

  const finalized = await db.cRMChangeProposal.updateMany({
    where: {
      id: proposalId,
      status: "applying",
      applyStartedAt: proposal.applyStartedAt,
    },
    data: {
      status: nextStatus,
      applyStartedAt: null,
      reviewedBy: actorId,
      reviewedAt: new Date(),
      completedAt: new Date(),
    },
  });
  if (finalized.count !== 1) {
    throw new Error("La propuesta perdió el candado de aplicación");
  }

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
      changeProposalId: proposalId,
      causedByItemId: change.itemId,
    });
  }

  // Mismo evento que dispara la UI al mover una tarea de estado.
  for (const change of taskStatusChanges) {
    await evaluateWorkflows(db, organizationId, {
      entityType: "activity",
      entityId: change.taskId,
      eventName: "status_changed",
      actorId,
      before: { status: change.from },
      after: { status: change.to },
      changeProposalId: proposalId,
      causedByItemId: change.itemId,
    });
  }

  return { applied, failed };
}

function asRevertData(value: Prisma.JsonValue): RevertData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RevertData)
    : {};
}

export class RevertConflictError extends Error {
  constructor(
    public readonly code:
      | "undo_expired"
      | "changed_after_apply"
      | "dependencies"
      | "missing_target",
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = "RevertConflictError";
  }
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

function sameValue(current: unknown, expected: unknown): boolean {
  const left = comparable(current);
  const right = comparable(expected);
  if (
    (left == null || typeof left !== "object") &&
    (right == null || typeof right !== "object")
  ) {
    return left == null && right == null
      ? true
      : String(left) === String(right);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

async function currentFieldValue(
  db: TenantClient,
  item: ItemRecord,
  ctx: ApplyContext,
  field: string,
): Promise<unknown> {
  const entity = asAgentEntity(item.entity);
  const entityId =
    item.entityId ?? (entity === "company" ? ctx.companyId : null);
  if (!entityId) return undefined;
  const fields = await getWritableFields(db, entity);
  const spec = resolveField(fields, entity, field);
  if (spec.customDefinition) {
    const value = await db.customFieldValue.findFirst({
      where: {
        entityType: entity,
        entityId,
        fieldDefinitionId: spec.customDefinition.id,
      },
    });
    if (!value) return null;
    switch (spec.customDefinition.fieldType) {
      case "text":
      case "select":
        return value.valueText;
      case "number":
        return value.valueNumber;
      case "boolean":
        return value.valueBoolean;
      case "date":
        return value.valueDate;
      case "multiselect":
        return value.valueJson;
    }
  }
  if (entity === "opportunity" && field === "stage") {
    const row = await db.opportunity.findUnique({
      where: { id: entityId },
      select: { stage: { select: { key: true } } },
    });
    return row?.stage.key;
  }
  const row =
    entity === "company"
      ? await db.company.findUnique({ where: { id: entityId } })
      : entity === "opportunity"
        ? await db.opportunity.findUnique({ where: { id: entityId } })
        : await db.person.findUnique({ where: { id: entityId } });
  return row ? (row as unknown as Record<string, unknown>)[field] : undefined;
}

async function assertCreatedEntityRevertible(
  db: TenantClient,
  item: ItemRecord & {
    appliedAt?: Date | null;
    appliedSnapshot?: Prisma.JsonValue | null;
  },
  revert: RevertData,
): Promise<void> {
  const id = revert.createdEntityId;
  if (!id) return;
  const dependencies: string[] = [];
  let updatedAt: Date | null = null;
  let currentRecord: unknown = null;

  if (item.type === "add_company") {
    const [row, people, opportunities, activities, notes, meetings] =
      await Promise.all([
        db.company.findUnique({ where: { id } }),
        db.person.count({ where: { companyId: id } }),
        db.opportunity.count({ where: { companyId: id } }),
        db.activity.count({ where: { companyId: id } }),
        db.note.count({ where: { companyId: id } }),
        db.meeting.count({ where: { companyId: id } }),
      ]);
    if (!row)
      throw new RevertConflictError(
        "missing_target",
        "La empresa ya no existe.",
      );
    updatedAt = row.updatedAt;
    currentRecord = row;
    if (people) dependencies.push(`${people} contacto(s)`);
    if (opportunities) dependencies.push(`${opportunities} oportunidad(es)`);
    if (activities) dependencies.push(`${activities} actividad(es)`);
    if (notes) dependencies.push(`${notes} nota(s)`);
    if (meetings) dependencies.push(`${meetings} reunión(es)`);
  } else if (item.type === "add_opportunity") {
    const [row, activities, notes, meetings] = await Promise.all([
      db.opportunity.findUnique({ where: { id } }),
      db.activity.count({ where: { opportunityId: id } }),
      db.note.count({ where: { opportunityId: id } }),
      db.meeting.count({ where: { opportunityId: id } }),
    ]);
    if (!row)
      throw new RevertConflictError(
        "missing_target",
        "La oportunidad ya no existe.",
      );
    updatedAt = row.updatedAt;
    currentRecord = row;
    if (activities) dependencies.push(`${activities} actividad(es)`);
    if (notes) dependencies.push(`${notes} nota(s)`);
    if (meetings) dependencies.push(`${meetings} reunión(es)`);
  } else if (item.type === "add_contact") {
    const [row, activities, participations, notes, decisions, sponsors] =
      await Promise.all([
        db.person.findUnique({ where: { id } }),
        db.activity.count({ where: { personId: id } }),
        db.activityPerson.count({ where: { personId: id } }),
        db.note.count({ where: { personId: id } }),
        db.opportunity.count({
          where: {
            decisionMakerId: id,
            ...(revert.opportunityId
              ? { id: { not: revert.opportunityId } }
              : {}),
          },
        }),
        db.opportunity.count({
          where: {
            sponsorId: id,
            ...(revert.opportunityId
              ? { id: { not: revert.opportunityId } }
              : {}),
          },
        }),
      ]);
    if (!row)
      throw new RevertConflictError(
        "missing_target",
        "El contacto ya no existe.",
      );
    updatedAt = row.updatedAt;
    currentRecord = row;
    if (activities + participations)
      dependencies.push("actividades vinculadas");
    if (notes) dependencies.push(`${notes} nota(s)`);
    if (decisions + sponsors) dependencies.push("oportunidades vinculadas");
  } else if (item.type === "create_task" || item.type === "log_activity") {
    const row = await db.activity.findUnique({ where: { id } });
    if (!row)
      throw new RevertConflictError(
        "missing_target",
        "La actividad ya no existe.",
      );
    updatedAt = row.updatedAt;
    currentRecord = row;
  } else if (item.type === "add_note") {
    const row = await db.note.findUnique({ where: { id } });
    if (!row)
      throw new RevertConflictError("missing_target", "La nota ya no existe.");
    updatedAt = row.updatedAt;
    currentRecord = row;
  } else if (item.type === "create_meeting") {
    const [row, evidence, proposals] = await Promise.all([
      db.meeting.findUnique({ where: { id } }),
      db.evidence.count({ where: { meetingId: id } }),
      db.cRMChangeProposal.count({ where: { meetingId: id } }),
    ]);
    if (!row)
      throw new RevertConflictError(
        "missing_target",
        "La reunión ya no existe.",
      );
    updatedAt = row.updatedAt;
    currentRecord = row;
    if (evidence) dependencies.push(`${evidence} evidencia(s)`);
    if (proposals) dependencies.push(`${proposals} análisis asociado(s)`);
  }

  if (dependencies.length) {
    throw new RevertConflictError(
      "dependencies",
      `No se puede eliminar porque tiene ${dependencies.join(", ")}.`,
      dependencies,
    );
  }
  const expectedRecord = asRecord(item.appliedSnapshot ?? null).record;
  if (
    expectedRecord &&
    currentRecord &&
    !sameValue(currentRecord, expectedRecord)
  ) {
    throw new RevertConflictError(
      "changed_after_apply",
      "El registro fue editado después de que la IA lo creó.",
    );
  }
  if (
    !expectedRecord &&
    updatedAt &&
    item.appliedAt &&
    updatedAt.getTime() > item.appliedAt.getTime() + 1_000
  ) {
    throw new RevertConflictError(
      "changed_after_apply",
      "El registro fue editado después de que la IA lo creó.",
    );
  }
}

export async function preflightRevertItem(
  db: TenantClient,
  organizationId: string,
  itemId: string,
): Promise<void> {
  const item = await db.cRMChangeItem.findFirst({
    where: { id: itemId, organizationId },
    include: { proposal: { select: { id: true, status: true } } },
  });
  if (!item) throw new Error("Cambio no encontrado");
  if (item.status === "reverted") return;
  if (item.status !== "applied") {
    throw new Error("Solo se pueden deshacer cambios aplicados");
  }
  if (item.undoExpiresAt && item.undoExpiresAt.getTime() < Date.now()) {
    throw new RevertConflictError(
      "undo_expired",
      "El plazo de 90 días para deshacer este cambio venció.",
    );
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
    actorId: "preflight",
  };
  const before = asRecord(item.beforeValue);
  const after = asRecord(item.appliedSnapshot ?? item.afterValue);
  const record: ItemRecord & {
    appliedAt?: Date | null;
    appliedSnapshot?: Prisma.JsonValue | null;
  } = {
    id: item.id,
    type: item.type,
    entity: item.entity,
    entityId: item.entityId,
    beforeValue: item.beforeValue,
    afterValue: item.afterValue,
    approved: item.approved,
    status: item.status,
    appliedAt: item.appliedAt,
    appliedSnapshot: item.appliedSnapshot,
  };
  const revert = asRevertData(item.revertData);
  await assertCreatedEntityRevertible(db, record, revert);

  let matches = true;
  if (item.type === "update_field") {
    matches = sameValue(
      await currentFieldValue(db, record, ctx, String(after.field)),
      after.value,
    );
  } else if (item.type === "stage_change") {
    const current = await db.opportunity.findUnique({
      where: { id: item.entityId ?? "" },
      select: { stage: { select: { key: true } } },
    });
    matches = sameValue(current?.stage.key, after.value);
  } else if (item.type === "update_pain") {
    const current = await db.opportunity.findUnique({
      where: { id: item.entityId ?? "" },
      select: { mainPain: true },
    });
    matches = sameValue(current?.mainPain, after.value);
  } else if (item.type === "update_next_step") {
    const current = await db.opportunity.findUnique({
      where: { id: item.entityId ?? "" },
      select: { nextStep: true, nextStepDueDate: true },
    });
    matches =
      sameValue(current?.nextStep, after.nextStep) &&
      sameValue(current?.nextStepDueDate, after.nextStepDueDate);
  } else if (item.type === "update_note") {
    const current = await db.note.findUnique({
      where: { id: item.entityId ?? "" },
      select: { title: true, body: true },
    });
    matches =
      current != null &&
      (!Object.hasOwn(after, "title") ||
        sameValue(current.title, after.title)) &&
      (!Object.hasOwn(after, "body") || sameValue(current.body, after.body));
  } else if (item.type === "update_task") {
    const current = await db.activity.findUnique({
      where: { id: item.entityId ?? "" },
    });
    matches = current != null;
    for (const [field, expected] of Object.entries(after)) {
      if (field === "taskId") continue;
      if (
        !sameValue(
          (current as unknown as Record<string, unknown>)?.[field],
          expected,
        )
      ) {
        matches = false;
        break;
      }
    }
  } else if (item.type === "update_activity") {
    const current = await db.activity.findUnique({
      where: { id: item.entityId ?? "" },
      include: { participants: { select: { personId: true } } },
    });
    const currentRecord = current
      ? {
          ...current,
          occurredAt: current.occurredAt?.toISOString() ?? null,
          personIds: current.participants.map(({ personId }) => personId),
        }
      : null;
    matches = currentRecord != null;
    for (const [field, expected] of Object.entries(after)) {
      if (
        !sameValue(
          (currentRecord as Record<string, unknown> | null)?.[field],
          expected,
        )
      ) {
        matches = false;
        break;
      }
    }
  } else if (item.type === "update_meeting") {
    const current = await db.meeting.findUnique({
      where: { id: item.entityId ?? "" },
    });
    const currentRecord = current
      ? { ...current, meetingDate: current.meetingDate.toISOString() }
      : null;
    matches = currentRecord != null;
    for (const [field, expected] of Object.entries(after)) {
      if (
        !sameValue(
          (currentRecord as Record<string, unknown> | null)?.[field],
          expected,
        )
      ) {
        matches = false;
        break;
      }
    }
  } else if (
    (item.type === "link_contact" || item.type === "add_contact") &&
    !revert.createdEntityId &&
    (item.entityId || revert.personId)
  ) {
    const personId = item.entityId ?? revert.personId!;
    const current = await db.person.findUnique({ where: { id: personId } });
    if (!current) {
      throw new RevertConflictError(
        "missing_target",
        "El contacto ya no existe.",
      );
    }
    for (const field of revert.filledFields ?? []) {
      if (
        !sameValue(
          (current as unknown as Record<string, unknown>)[field],
          after[field],
        )
      ) {
        matches = false;
        break;
      }
    }
  }
  if (!matches) {
    throw new RevertConflictError(
      "changed_after_apply",
      "El registro cambió después de la acción de IA; no se sobrescribió el trabajo posterior.",
      Object.keys(before),
    );
  }
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
  options: {
    transaction?: Prisma.TransactionClient;
    skipPreflight?: boolean;
    includeEffects?: boolean;
    skipStatusRecompute?: boolean;
  } = {},
): Promise<void> {
  const item = await db.cRMChangeItem.findFirst({
    where: { id: itemId, organizationId },
    include: { proposal: { select: { id: true, status: true } } },
  });
  if (!item) throw new Error("Cambio no encontrado");
  if (item.proposal.status === "applying") {
    throw new Error("La propuesta todavía se está aplicando");
  }
  if (item.status === "reverted") return;
  if (item.status !== "applied") {
    throw new Error("Solo se pueden deshacer cambios aplicados");
  }
  const effects =
    options.includeEffects === false
      ? []
      : await db.cRMChangeItem.findMany({
          where: { causedByItemId: item.id, status: "applied" },
          orderBy: [{ sequence: "desc" }, { appliedAt: "desc" }],
          select: { id: true },
        });
  if (!options.skipPreflight) {
    for (const effect of effects) {
      await preflightRevertItem(db, organizationId, effect.id);
    }
    await preflightRevertItem(db, organizationId, itemId);
  }
  if (effects.length > 0 && !options.transaction) {
    await withOrgTransaction(organizationId, async (tx) => {
      for (const effect of effects) {
        await revertItem(db, organizationId, effect.id, actorId, {
          transaction: tx,
          skipPreflight: true,
          includeEffects: false,
          skipStatusRecompute: true,
        });
      }
      await revertItem(db, organizationId, itemId, actorId, {
        transaction: tx,
        skipPreflight: true,
        includeEffects: false,
        skipStatusRecompute: true,
      });
    });
    await recomputeProposalStatus(db, item.proposal.id);
    return;
  }
  for (const effect of effects) {
    await revertItem(db, organizationId, effect.id, actorId);
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

  const mutate = async (tx: Prisma.TransactionClient) => {
    switch (item.type) {
      case "update_field": {
        const field = String(after.field);
        await applyFieldUpdate(
          tx,
          itemRecord,
          ctx,
          field,
          before.value ?? null,
        );
        break;
      }
      case "stage_change": {
        if (item.entityId && before.value != null) {
          const stage = resolveStage(ctx, before.value);
          await tx.opportunity.update({
            where: { id: item.entityId, organizationId },
            data: { stageId: stage.id },
          });
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
              nextStep:
                before.nextStep == null ? null : String(before.nextStep),
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
        } else if (revert.personId && revert.filledFields?.length) {
          await clearFilledPersonFields(
            tx,
            organizationId,
            revert.personId,
            revert.filledFields,
          );
        }
        if (revert.createdRelationshipId) {
          await tx.personCompanyRelationship.delete({
            where: { id: revert.createdRelationshipId, organizationId },
          });
        }
        break;
      }
      case "add_opportunity": {
        if (revert.createdEntityId) {
          await tx.opportunity.delete({
            where: { id: revert.createdEntityId, organizationId },
          });
        }
        break;
      }
      case "add_company": {
        if (revert.createdEntityId) {
          await tx.company.delete({
            where: { id: revert.createdEntityId, organizationId },
          });
        }
        break;
      }
      case "link_contact": {
        await restoreOpportunityLinks(tx, organizationId, revert);
        if (item.entityId && revert.filledFields?.length) {
          await clearFilledPersonFields(
            tx,
            organizationId,
            item.entityId,
            revert.filledFields,
          );
        }
        if (revert.createdRelationshipId) {
          await tx.personCompanyRelationship.delete({
            where: { id: revert.createdRelationshipId, organizationId },
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
      case "log_activity": {
        if (revert.loggedActivity) {
          await revertLoggedActivity(tx, organizationId, revert.loggedActivity);
        }
        break;
      }
      case "create_meeting": {
        if (revert.manualMeeting) {
          await revertManualMeeting(tx, organizationId, revert.manualMeeting);
        }
        break;
      }
      case "update_task": {
        if (revert.taskUpdate) {
          await revertTaskUpdate(tx, organizationId, revert.taskUpdate);
        }
        break;
      }
      case "update_note": {
        if (item.entityId) {
          await tx.note.update({
            where: { id: item.entityId, organizationId },
            data: {
              ...(Object.hasOwn(before, "title")
                ? { title: optionalString(before.title) }
                : {}),
              ...(Object.hasOwn(before, "body")
                ? { body: String(before.body ?? "") }
                : {}),
            },
          });
        }
        break;
      }
      case "update_activity": {
        if (item.entityId) {
          const personIds = Array.isArray(before.personIds)
            ? before.personIds.map(String)
            : [];
          await tx.activity.update({
            where: { id: item.entityId, organizationId },
            data: {
              companyId: optionalString(before.companyId),
              opportunityId: optionalString(before.opportunityId),
              personId: personIds[0] ?? null,
              type: String(before.type),
              title: String(before.title),
              occurredAt: optionalDate(before.occurredAt),
              completedAt: optionalDate(before.occurredAt),
              durationMinutes:
                before.durationMinutes == null
                  ? null
                  : Number(before.durationMinutes),
              channel: optionalString(before.channel),
              description: optionalString(before.description),
              outcomes: optionalString(before.outcomes),
              participants: {
                deleteMany: {},
                create: personIds.map((personId) => ({
                  organizationId,
                  personId,
                })),
              },
            },
          });
          if (revert.activityUpdate) {
            await tx.company.update({
              where: {
                id: revert.activityUpdate.companyId,
                organizationId,
              },
              data: {
                lastContactAt: revert.activityUpdate
                  .previousCompanyLastContactAt
                  ? new Date(revert.activityUpdate.previousCompanyLastContactAt)
                  : null,
              },
            });
          }
        }
        break;
      }
      case "update_meeting": {
        if (item.entityId) {
          await tx.meeting.update({
            where: { id: item.entityId, organizationId },
            data: {
              companyId: String(before.companyId),
              opportunityId: optionalString(before.opportunityId),
              title: String(before.title),
              meetingDate: new Date(String(before.meetingDate)),
              meetingType: String(before.meetingType),
              participants: (before.participants ??
                []) as Prisma.InputJsonValue,
              status: String(before.status),
              aiSummary:
                before.aiSummary == null
                  ? Prisma.JsonNull
                  : (before.aiSummary as Prisma.InputJsonValue),
            },
          });
        }
        break;
      }
      default:
        throw new Error(`No se puede deshacer el tipo: ${item.type}`);
    }

    await tx.cRMChangeItem.update({
      where: { id: item.id, organizationId },
      data: {
        status: "reverted",
        revertedAt: new Date(),
        revertedBy: actorId,
      },
    });
  };

  if (options.transaction) {
    await mutate(options.transaction);
  } else {
    await withOrgTransaction(organizationId, mutate);
  }

  await appendTimelineEvent(options.transaction ?? db, {
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

  // Undo is compensating history, not a new business event: workflows are not
  // fired again, otherwise reverting a stage could create fresh side effects.
  if (!options.skipStatusRecompute) {
    await recomputeProposalStatus(db, item.proposal.id);
  }
}

async function recomputeProposalStatus(
  db: TenantClient,
  proposalId: string,
): Promise<void> {
  const items = await db.cRMChangeItem.findMany({
    where: { proposalId },
    select: { status: true },
  });
  const reverted = items.filter((item) => item.status === "reverted").length;
  if (!reverted) return;
  await db.cRMChangeProposal.update({
    where: { id: proposalId },
    data: {
      status: reverted < items.length ? "partially_reverted" : "reverted",
      completedAt: new Date(),
    },
  });
}

export async function revertProposal(
  db: TenantClient,
  organizationId: string,
  proposalId: string,
  actorId: string,
): Promise<{ reverted: number }> {
  const proposal = await db.cRMChangeProposal.findFirst({
    where: { id: proposalId, organizationId },
    include: {
      items: { orderBy: [{ sequence: "desc" }, { appliedAt: "desc" }] },
    },
  });
  if (!proposal) throw new Error("Cambio no encontrado");
  const appliedItems = proposal.items.filter(
    (item) => item.status === "applied",
  );
  for (const item of appliedItems) {
    await preflightRevertItem(db, organizationId, item.id);
  }
  if (!appliedItems.length) return { reverted: 0 };

  await withOrgTransaction(organizationId, async (tx) => {
    for (const item of appliedItems) {
      await revertItem(db, organizationId, item.id, actorId, {
        transaction: tx,
        skipPreflight: true,
        includeEffects: false,
        skipStatusRecompute: true,
      });
    }
    const alreadyReverted = proposal.items.filter(
      (item) => item.status === "reverted",
    ).length;
    await tx.cRMChangeProposal.update({
      where: { id: proposal.id, organizationId },
      data: {
        status:
          alreadyReverted + appliedItems.length === proposal.items.length
            ? "reverted"
            : "partially_reverted",
        completedAt: new Date(),
      },
    });
  });
  return { reverted: appliedItems.length };
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
