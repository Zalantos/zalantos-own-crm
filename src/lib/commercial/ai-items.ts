import { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { revertLoggedActivity, type LoggedActivityRevert } from "@/lib/crm/activity-records";
import { isInteractionType } from "@/lib/activity-types";
import { recordStageTransition, recordStatusChange } from "@/lib/commercial/history";
import { applyStatusChangeTx } from "@/lib/commercial/opportunity-service";
import {
  changeLeadStatusTx,
  convertLeadToOpportunityTx,
  createCommercialLeadTx,
  type CreateLeadInput,
  type LeadStatus,
} from "@/lib/commercial/leads";
import {
  clearOpportunityRoleFieldTx,
  linkActorTx,
  restoreActorLinkTx,
  unlinkActorTx,
  updateActorLinkTx,
  type ActorFieldName,
  type ActorLinkSnapshot,
} from "@/lib/commercial/actor-service";
import { isActorRole, parseActorKey, type ActorTarget } from "@/lib/commercial/actors";
import type { SettableOpportunityStatus } from "@/lib/opportunities/status";

// Tipos de ítem de la bitácora IA (CRMChangeItem) del proceso comercial.
// apply.ts delega acá: cada ítem se aplica en su propia transacción, guarda
// un snapshot posterior canónico y lo necesario para deshacerlo; deshacer
// compara el estado actual con el snapshot para no pisar trabajo posterior.
export const COMMERCIAL_ITEM_TYPES = [
  "status_change",
  "add_commercial_lead",
  "commercial_lead_status",
  "convert_lead",
  "set_next_action",
  "link_actor",
  "update_actor",
  "unlink_actor",
] as const;

export type CommercialItemType = (typeof COMMERCIAL_ITEM_TYPES)[number];

export function isCommercialItemType(type: string): type is CommercialItemType {
  return (COMMERCIAL_ITEM_TYPES as readonly string[]).includes(type);
}

type Tx = Prisma.TransactionClient;

export type CommercialItem = {
  id: string;
  type: string;
  entity: string;
  entityId: string | null;
  afterValue: Prisma.JsonValue;
};

export type CommercialApplyContext = {
  organizationId: string;
  actorId: string;
  // agent | meeting | enrichment
  createdVia: string;
  timelineBase: Record<string, unknown>;
};

type RecordModel = "opportunity" | "commercialLead" | "commercialPartner";

export type CommercialRevertData = {
  restore?: { model: RecordModel; id: string; previous: Record<string, unknown> };
  createdEntityId?: string;
  createdCompanyId?: string | null;
  createdPersonId?: string | null;
  createdAttributionId?: string | null;
  loggedActivity?: LoggedActivityRevert | null;
  convertedLeadId?: string;
  statusChange?: { from: string; to: string };
  // Deshacer vínculos de actores: lo creado se borra, lo quitado se restaura y
  // los campos decisor/sponsor vuelven a su valor anterior.
  createdActorLinkId?: string;
  restoreActorLinks?: ActorLinkSnapshot[];
  actorField?: { opportunityId: string; field: ActorFieldName; previous: string | null };
};

const OPPORTUNITY_STATUS_FIELDS = [
  "status",
  "statusChangedAt",
  "pausedAt",
  "pauseReason",
  "reactivateAt",
  "reactivationCriteria",
  "wonAt",
  "wonEvidence",
  "lostAt",
  "lossReason",
  "lossDetail",
  "closedById",
] as const;

const LEAD_STATUS_FIELDS = [
  "status",
  "statusChangedAt",
  "firstContactAt",
  "becameLeadAt",
  "interestSignal",
  "disqualifiedAt",
  "disqualificationReason",
] as const;

const NEXT_ACTION_FIELDS = [
  "nextStep",
  "nextStepDueDate",
  "nextStepChannel",
  "nextStepContext",
  "nextStepUpdatedAt",
] as const;

function asRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function jsonable(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function pick(row: Record<string, unknown> | null, fields: readonly string[]) {
  return Object.fromEntries(fields.map((field) => [field, row?.[field] ?? null]));
}

// Prisma delegates difieren por modelo; se accede de forma acotada por nombre.
type GenericDelegate = {
  findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
};

function delegate(client: Tx | TenantClient, model: RecordModel): GenericDelegate {
  return (client as unknown as Record<RecordModel, GenericDelegate>)[model];
}

function reviveDates(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" && /(At|Date)$/.test(key) ? new Date(value) : value,
    ]),
  );
}

async function readFields(
  client: Tx | TenantClient,
  model: RecordModel,
  organizationId: string,
  id: string,
  fields: readonly string[],
) {
  const row = await delegate(client, model).findFirst({ where: { id, organizationId } });
  return row ? pick(row, fields) : null;
}

function entityModel(entity: unknown): RecordModel {
  if (entity === "commercial_lead") return "commercialLead";
  if (entity === "commercial_partner") return "commercialPartner";
  return "opportunity";
}

export async function applyCommercialItem(
  tx: Tx,
  item: CommercialItem,
  ctx: CommercialApplyContext,
): Promise<CommercialRevertData> {
  const after = asRecord(item.afterValue);
  const base = { organizationId: ctx.organizationId, actorId: ctx.actorId, createdVia: ctx.createdVia };

  switch (item.type as CommercialItemType) {
    case "status_change": {
      if (!item.entityId) throw new Error("Falta oportunidad destino");
      const previous = await readFields(tx, "opportunity", ctx.organizationId, item.entityId, OPPORTUNITY_STATUS_FIELDS);
      const result = await applyStatusChangeTx(tx, {
        organizationId: ctx.organizationId,
        opportunityId: item.entityId,
        actorId: ctx.actorId,
        source: ctx.createdVia,
        timelineBase: ctx.timelineBase,
        change: {
          status: String(after.status) as SettableOpportunityStatus,
          reason: str(after.reason),
          reactivateAt: date(after.reactivateAt),
          reactivationCriteria: str(after.reactivationCriteria),
          wonEvidence: str(after.wonEvidence),
          closedAt: date(after.closedAt),
          lossReason: str(after.lossReason),
          lossDetail: str(after.lossDetail),
        },
      });
      return {
        restore: { model: "opportunity", id: item.entityId, previous: jsonable(previous) as Record<string, unknown> },
        statusChange: { from: result.from, to: result.to },
      };
    }
    case "add_commercial_lead": {
      const input = after as unknown as CreateLeadInput;
      const contact = asRecord(after.contactAttempt);
      const lead = await createCommercialLeadTx(tx, base as { organizationId: string; actorId: string; createdVia: string }, {
        ...input,
        identifiedAt: date(after.identifiedAt),
        nextStepDueDate: date(after.nextStepDueDate),
        contactAttempt:
          after.contactAttempt && isInteractionType(String(contact.type))
            ? {
                type: String(contact.type) as never,
                occurredAt: date(contact.occurredAt) ?? new Date(),
                summary: str(contact.summary),
              }
            : null,
      });
      return {
        createdEntityId: lead.id,
        createdCompanyId: lead.createdCompanyId,
        createdPersonId: lead.createdPersonId,
        createdAttributionId: input.attributionId ? null : lead.attributionId,
      };
    }
    case "commercial_lead_status": {
      if (!item.entityId) throw new Error("Falta prospecto destino");
      const previous = await readFields(tx, "commercialLead", ctx.organizationId, item.entityId, LEAD_STATUS_FIELDS);
      const contact = asRecord(after.contactAttempt);
      const result = await changeLeadStatusTx(tx, base as { organizationId: string; actorId: string; createdVia: string }, item.entityId, {
        status: String(after.status) as LeadStatus,
        reason: str(after.reason),
        interestSignal: str(after.interestSignal),
        contactAttempt:
          after.contactAttempt && isInteractionType(String(contact.type))
            ? {
                type: String(contact.type) as never,
                occurredAt: date(contact.occurredAt) ?? new Date(),
                summary: str(contact.summary),
                outcomes: str(contact.outcomes),
              }
            : null,
      });
      return {
        restore: { model: "commercialLead", id: item.entityId, previous: jsonable(previous) as Record<string, unknown> },
        loggedActivity: result.loggedActivity,
        statusChange: { from: result.from, to: result.to },
      };
    }
    case "convert_lead": {
      if (!item.entityId) throw new Error("Falta prospecto destino");
      const previous = await readFields(tx, "commercialLead", ctx.organizationId, item.entityId, [
        "status",
        "convertedAt",
        "statusChangedAt",
        "companyId",
      ]);
      const result = await convertLeadToOpportunityTx(tx, base as { organizationId: string; actorId: string; createdVia: string }, item.entityId, {
        name: String(after.name ?? ""),
        companyId: str(after.companyId),
        mainPain: str(after.mainPain),
        situation: str(after.situation),
        estimatedValue: typeof after.estimatedValue === "number" ? after.estimatedValue : null,
        ownerId: str(after.ownerId),
        nextStep: str(after.nextStep),
        nextStepDueDate: date(after.nextStepDueDate),
      });
      return {
        createdEntityId: result.opportunityId,
        convertedLeadId: item.entityId,
        restore: { model: "commercialLead", id: item.entityId, previous: jsonable(previous) as Record<string, unknown> },
      };
    }
    case "set_next_action": {
      if (!item.entityId) throw new Error("Falta registro destino");
      const model = entityModel(item.entity);
      const previous = await readFields(tx, model, ctx.organizationId, item.entityId, NEXT_ACTION_FIELDS);
      if (!previous) throw new Error("Registro no encontrado");
      await delegate(tx, model).update({
        where: { id: item.entityId, organizationId: ctx.organizationId },
        data: {
          nextStep: str(after.nextStep),
          nextStepDueDate: date(after.nextStepDueDate),
          nextStepChannel: str(after.nextStepChannel),
          nextStepContext: str(after.nextStepContext),
          nextStepUpdatedAt: new Date(),
        },
      });
      return { restore: { model, id: item.entityId, previous: jsonable(previous) as Record<string, unknown> } };
    }
    case "link_actor": {
      const actor = parseActorKey(str(after.actorKey));
      const targetId = str(after.targetId);
      const role = after.role;
      if (!actor || !targetId || !isActorRole(role)) throw new Error("Vínculo de actor inválido");
      const target: ActorTarget = {
        type: after.targetType === "commercial_lead" ? "commercial_lead" : "opportunity",
        id: targetId,
      };
      const result = await linkActorTx(
        tx,
        { organizationId: ctx.organizationId, userId: ctx.actorId, source: ctx.createdVia },
        { target, actor, role, description: str(after.description) },
      );
      if (result.kind === "link") return { createdActorLinkId: result.linkId };
      return {
        actorField: { opportunityId: targetId, field: result.field, previous: result.previous },
        restoreActorLinks: result.removedLink ? [result.removedLink] : [],
      };
    }
    case "update_actor": {
      const linkId = item.entityId;
      if (!linkId || !isActorRole(after.role)) throw new Error("Vínculo de actor inválido");
      const { before, result } = await updateActorLinkTx(
        tx,
        { organizationId: ctx.organizationId, userId: ctx.actorId, source: ctx.createdVia },
        linkId,
        { role: after.role, description: str(after.description) },
      );
      if (result.kind === "field") {
        return {
          actorField: {
            opportunityId: before.opportunityId as string,
            field: result.field,
            previous: result.previous,
          },
          restoreActorLinks: [before],
        };
      }
      return { restoreActorLinks: [before], createdActorLinkId: linkId };
    }
    case "unlink_actor": {
      const context = { organizationId: ctx.organizationId, userId: ctx.actorId, source: ctx.createdVia };
      const field = str(after.field);
      if (field === "decisionMakerId" || field === "sponsorId") {
        if (!item.entityId) throw new Error("Falta oportunidad destino");
        const previous = await clearOpportunityRoleFieldTx(tx, context, item.entityId, field);
        return { actorField: { opportunityId: item.entityId, field, previous } };
      }
      if (!item.entityId) throw new Error("Falta vínculo de actor");
      return { restoreActorLinks: [await unlinkActorTx(tx, context, item.entityId)] };
    }
  }
}

// Snapshot canónico posterior: los campos que deshacer debe encontrar
// intactos.
export async function commercialSnapshot(
  tx: Tx,
  organizationId: string,
  revert: CommercialRevertData,
): Promise<Prisma.InputJsonValue> {
  const snapshot: Record<string, unknown> = {};
  if (revert.restore) {
    snapshot.fields = await readFields(
      tx,
      revert.restore.model,
      organizationId,
      revert.restore.id,
      Object.keys(revert.restore.previous),
    );
  }
  if (revert.createdEntityId) {
    const model: RecordModel = revert.convertedLeadId ? "opportunity" : "commercialLead";
    const row = await delegate(tx, model).findFirst({ where: { id: revert.createdEntityId, organizationId } });
    snapshot.createdEntityId = revert.createdEntityId;
    snapshot.createdUpdatedAt = row?.updatedAt ?? null;
  }
  return jsonable(snapshot);
}

export class CommercialRevertConflict extends Error {
  constructor(
    public readonly code: "changed_after_apply" | "dependencies" | "missing_target",
    message: string,
  ) {
    super(message);
  }
}

function same(a: unknown, b: unknown) {
  const norm = (value: unknown) =>
    value instanceof Date ? value.toISOString() : value == null ? null : typeof value === "object" ? JSON.stringify(value) : String(value);
  return norm(a) === norm(b);
}

// Verifica que se pueda deshacer sin pisar trabajo posterior ni borrar
// registros con dependencias ajenas a la acción de IA.
export async function preflightCommercialRevert(
  db: TenantClient,
  organizationId: string,
  type: string,
  revert: CommercialRevertData,
  snapshot: Prisma.JsonValue | null,
) {
  const snap = asRecord(snapshot);
  if (revert.restore && snap.fields) {
    const current = await readFields(
      db,
      revert.restore.model,
      organizationId,
      revert.restore.id,
      Object.keys(revert.restore.previous),
    );
    if (!current) throw new CommercialRevertConflict("missing_target", "El registro ya no existe.");
    const expected = asRecord(snap.fields);
    for (const [field, value] of Object.entries(expected)) {
      if (!same(current[field], value)) {
        throw new CommercialRevertConflict(
          "changed_after_apply",
          "El registro cambió después de la acción de IA; no se sobrescribió el trabajo posterior.",
        );
      }
    }
  }
  if (type === "add_commercial_lead" && revert.createdEntityId) {
    const id = revert.createdEntityId;
    const [lead, activities, notes, opportunities] = await Promise.all([
      db.commercialLead.findUnique({ where: { id }, select: { updatedAt: true } }),
      db.activity.count({ where: { commercialLeadId: id } }),
      db.note.count({ where: { commercialLeadId: id } }),
      db.opportunity.count({ where: { commercialLeadId: id } }),
    ]);
    if (!lead) return;
    if (!same(lead.updatedAt, snap.createdUpdatedAt)) {
      throw new CommercialRevertConflict("changed_after_apply", "El prospecto fue editado después de que la IA lo creó.");
    }
    if (activities > 1 || notes > 0 || opportunities > 0) {
      throw new CommercialRevertConflict(
        "dependencies",
        "El prospecto ya tiene interacciones, notas u oportunidades propias; no se elimina.",
      );
    }
  }
  if (type === "convert_lead" && revert.createdEntityId) {
    const id = revert.createdEntityId;
    const [opportunity, activities, notes, meetings, offers, partners] = await Promise.all([
      db.opportunity.findUnique({ where: { id }, select: { updatedAt: true } }),
      db.activity.count({ where: { opportunityId: id } }),
      db.note.count({ where: { opportunityId: id } }),
      db.meeting.count({ where: { opportunityId: id } }),
      db.commercialOffer.count({ where: { opportunityId: id } }),
      db.opportunityCommercialPartner.count({ where: { opportunityId: id } }),
    ]);
    if (!opportunity) return;
    if (!same(opportunity.updatedAt, snap.createdUpdatedAt)) {
      throw new CommercialRevertConflict("changed_after_apply", "La oportunidad fue editada después de crearse.");
    }
    if (activities + notes + meetings + offers + partners > 0) {
      throw new CommercialRevertConflict(
        "dependencies",
        "La oportunidad ya tiene actividades, notas, reuniones, ofertas o partners; no se elimina.",
      );
    }
  }
}

// Secuencial (misma transacción): borra la persona/empresa creada por la IA
// solo si no quedó referenciada por nada más.
async function countAll(counters: (() => Promise<number>)[]) {
  let total = 0;
  for (const counter of counters) total += await counter();
  return total;
}

async function deleteIfOrphan(tx: Tx, organizationId: string, kind: "person" | "company", id: string) {
  if (kind === "person") {
    const references = await countAll([
      () => tx.activity.count({ where: { organizationId, personId: id } }),
      () => tx.opportunity.count({ where: { organizationId, OR: [{ decisionMakerId: id }, { sponsorId: id }] } }),
      () => tx.commercialLead.count({ where: { organizationId, personId: id } }),
      () => tx.activityPerson.count({ where: { organizationId, personId: id } }),
      () => tx.commercialActorLink.count({ where: { organizationId, personId: id } }),
    ]);
    if (references === 0) await tx.person.deleteMany({ where: { id, organizationId } });
    return;
  }
  const references = await countAll([
    () => tx.person.count({ where: { organizationId, companyId: id } }),
    () => tx.opportunity.count({ where: { organizationId, companyId: id } }),
    () => tx.commercialLead.count({ where: { organizationId, companyId: id } }),
    () => tx.activity.count({ where: { organizationId, companyId: id } }),
    () => tx.note.count({ where: { organizationId, companyId: id } }),
    () => tx.meeting.count({ where: { organizationId, companyId: id } }),
    () => tx.commercialActorLink.count({ where: { organizationId, companyId: id } }),
  ]);
  if (references === 0) {
    await tx.timelineEvent.deleteMany({ where: { organizationId, companyId: id } });
    await tx.company.deleteMany({ where: { id, organizationId } });
  }
}

export async function revertCommercialItem(
  tx: Tx,
  organizationId: string,
  type: string,
  revert: CommercialRevertData,
  actorId: string,
) {
  if (revert.loggedActivity) {
    await revertLoggedActivity(tx, organizationId, revert.loggedActivity);
  }
  if (type === "convert_lead" && revert.createdEntityId) {
    await tx.opportunityStageHistory.deleteMany({ where: { organizationId, opportunityId: revert.createdEntityId } });
    await tx.timelineEvent.deleteMany({ where: { organizationId, opportunityId: revert.createdEntityId } });
    await tx.opportunity.deleteMany({ where: { id: revert.createdEntityId, organizationId } });
  }
  if (revert.restore) {
    const { model, id, previous } = revert.restore;
    await delegate(tx, model).update({ where: { id, organizationId }, data: reviveDates(previous) });
    if (model === "opportunity" && revert.statusChange) {
      const opportunity = await tx.opportunity.findFirst({
        where: { id, organizationId },
        select: { stage: { select: { id: true, key: true, label: true } } },
      });
      // Mantiene coherente el historial de etapas: vuelve a abrir o cierra
      // el período según el estado restaurado.
      if (revert.statusChange.from === "open" && opportunity) {
        await recordStageTransition(tx, {
          organizationId,
          opportunityId: id,
          stage: opportunity.stage,
          actorId,
          source: "revert",
          reason: "Cambio de estado deshecho",
        });
      } else if (revert.statusChange.to === "open") {
        await tx.opportunityStageHistory.updateMany({
          where: { organizationId, opportunityId: id, exitedAt: null },
          data: { exitedAt: new Date() },
        });
      }
    }
    if (revert.statusChange) {
      await recordStatusChange(tx, {
        organizationId,
        entityType: model === "opportunity" ? "opportunity" : "commercial_lead",
        entityId: id,
        fromValue: revert.statusChange.to,
        toValue: revert.statusChange.from,
        actorId,
        source: "revert",
        reason: "Cambio de IA deshecho",
      });
    }
  }
  if (revert.createdActorLinkId) {
    await tx.commercialActorLink.deleteMany({ where: { id: revert.createdActorLinkId, organizationId } });
  }
  if (revert.actorField) {
    await tx.opportunity.update({
      where: { id: revert.actorField.opportunityId, organizationId },
      data: { [revert.actorField.field]: revert.actorField.previous },
    });
  }
  for (const snapshot of revert.restoreActorLinks ?? []) {
    await restoreActorLinkTx(tx, organizationId, snapshot);
  }
  if (type === "add_commercial_lead" && revert.createdEntityId) {
    await tx.activity.deleteMany({ where: { organizationId, commercialLeadId: revert.createdEntityId } });
    await tx.commercialLead.deleteMany({ where: { id: revert.createdEntityId, organizationId } });
    if (revert.createdAttributionId) {
      await tx.commercialAttribution.deleteMany({ where: { id: revert.createdAttributionId, organizationId } });
    }
    if (revert.createdPersonId) await deleteIfOrphan(tx, organizationId, "person", revert.createdPersonId);
    if (revert.createdCompanyId) await deleteIfOrphan(tx, organizationId, "company", revert.createdCompanyId);
  }
}
